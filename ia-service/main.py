import os
import secrets
import shutil
from pathlib import Path
from uuid import uuid4

import cv2
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
INTERNAL_TOKEN = os.getenv("IA_INTERNAL_TOKEN", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()

UPLOADS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="IA Conteo Ganaderia Romilio", version="1.0.0")
allowed_origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

model = None


@app.middleware("http")
async def autenticar_servicio_interno(request: Request, call_next):
    protegida = request.url.path == "/detectar-vacas" or request.url.path.startswith("/outputs/")
    if protegida:
        if not INTERNAL_TOKEN and ENVIRONMENT == "production":
            return JSONResponse(status_code=503, content={"detail": "IA_INTERNAL_TOKEN no configurado"})
        recibido = request.headers.get("x-internal-token", "")
        if not INTERNAL_TOKEN or not secrets.compare_digest(recibido, INTERNAL_TOKEN):
            return JSONResponse(status_code=401, content={"detail": "Credencial interna inválida"})
    return await call_next(request)


def get_model():
    global model

    if model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(
                status_code=500,
                detail=f"No se encontro el modelo YOLO en {MODEL_PATH}",
            )

        model = YOLO(str(MODEL_PATH))

    return model


def confianza_promedio(detecciones):
    if not detecciones:
        return 0

    total = sum(deteccion["confianza"] for deteccion in detecciones)
    return round(total / len(detecciones), 4)


def dibujar_detecciones(image, detecciones):
    for deteccion in detecciones:
        x = int(deteccion["x"])
        y = int(deteccion["y"])
        width = int(deteccion["width"])
        height = int(deteccion["height"])
        confianza = deteccion["confianza"]

        cv2.rectangle(image, (x, y), (x + width, y + height), (36, 179, 73), 2)
        cv2.putText(
            image,
            f"vaca {confianza:.2f}",
            (x, max(y - 8, 16)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (36, 179, 73),
            2,
            cv2.LINE_AA,
        )

    return image


@app.get("/health")
def health():
    return {
        "status": "ok",
        "modeloExiste": MODEL_PATH.exists(),
        "modelo": str(MODEL_PATH),
    }


@app.post("/detectar-vacas")
async def detectar_vacas(request: Request, imagen: UploadFile = File(...)):
    if not imagen.content_type or not imagen.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    extension = Path(imagen.filename or "imagen.jpg").suffix.lower() or ".jpg"
    nombre_base = f"{uuid4().hex}{extension}"
    input_path = UPLOADS_DIR / nombre_base
    output_path = OUTPUTS_DIR / f"procesada-{nombre_base}"

    with input_path.open("wb") as buffer:
        shutil.copyfileobj(imagen.file, buffer)

    image = cv2.imread(str(input_path))

    if image is None:
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen")

    modelo = get_model()
    resultados = modelo.predict(
        source=str(input_path),
        conf=CONFIDENCE_THRESHOLD,
        verbose=False,
    )

    detecciones = []

    for resultado in resultados:
        for box in resultado.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            confianza = float(box.conf[0])

            detecciones.append(
                {
                    "x": round(x1, 2),
                    "y": round(y1, 2),
                    "width": round(x2 - x1, 2),
                    "height": round(y2 - y1, 2),
                    "confianza": round(confianza, 4),
                }
            )

    imagen_procesada = dibujar_detecciones(image.copy(), detecciones)
    cv2.imwrite(str(output_path), imagen_procesada)

    imagen_procesada_url = str(request.url_for("outputs", path=output_path.name))

    return {
        "cantidadDetectada": len(detecciones),
        "confianzaPromedio": confianza_promedio(detecciones),
        "detecciones": detecciones,
        "imagenProcesadaUrl": imagen_procesada_url,
    }
