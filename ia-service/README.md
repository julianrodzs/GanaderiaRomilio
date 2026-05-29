# IA Service - Conteo de Vacas

Servicio separado en Python + FastAPI para detectar y contar vacas en imagenes de drone usando YOLO.

## Estructura

```txt
ia-service/
  main.py
  requirements.txt
  models/
    best.pt
  uploads/
  outputs/
```

Coloca el modelo entrenado en:

```txt
ia-service/models/best.pt
```

## Instalacion

Desde la carpeta `ia-service`:

```bash
python -m venv .venv
```

Windows PowerShell:

```bash
.venv\Scripts\Activate.ps1
```

Instalar dependencias:

```bash
pip install -r requirements.txt
```

## Ejecutar

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Health check:

```txt
GET http://localhost:8001/health
```

Endpoint de deteccion:

```txt
POST http://localhost:8001/detectar-vacas
```

Body:

- `multipart/form-data`
- campo `imagen`

## Integracion con backend Node

En `backend/.env`:

```env
IA_CONTEO_URL=http://localhost:8001
```

El backend Node enviara la imagen al endpoint:

```txt
POST /detectar-vacas
```
