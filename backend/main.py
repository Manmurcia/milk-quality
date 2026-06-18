"""
Backend FastAPI — Sistema de Calidad de Leche con IA nativa
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
import os
import random
import math
from datetime import datetime, timedelta

# Permitir importar backend/model.py cuando se ejecuta desde el root del proyecto
import sys
sys.path.append(os.path.dirname(__file__))

from model import get_model

app = FastAPI(
    title="API Calidad de Leche",
    description="Sistema de evaluación de calidad láctea con IA nativa (Gradient Boosting)",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class MuestraLeche(BaseModel):
    temperatura: float = Field(..., ge=-2, le=30, description="Temperatura en °C")
    ph: float = Field(..., ge=5.0, le=9.0, description="Nivel de pH")
    conductividad: float = Field(..., ge=0.5, le=15.0, description="Conductividad en mS/cm")
    acidez: float = Field(..., ge=0.05, le=0.50, description="Acidez titulable (% ácido láctico)")
    grasa: float = Field(..., ge=0.5, le=9.0, description="Contenido de grasa (%)")
    proteina: float = Field(..., ge=1.0, le=7.0, description="Contenido de proteína (%)")
    cst: float = Field(..., ge=0, le=2000, description="Conteo Somático Total (miles de células/mL)")
    id_muestra: str | None = Field(None, description="Identificador de muestra")


class TrainResponse(BaseModel):
    mensaje: str
    metrics: dict


@app.get("/")
def root():
    return {"sistema": "Calidad de Leche IA", "version": "2.0", "estado": "activo"}


@app.get("/api/health")
def health():
    model = get_model()
    return {
        "status": "ok",
        "modelo_entrenado": model.trained,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/predecir")
def predecir(muestra: MuestraLeche):
    """Evalúa una muestra de leche con el modelo IA nativo."""
    try:
        model = get_model()
        resultado = model.predict(
            muestra.temperatura,
            muestra.ph,
            muestra.conductividad,
            muestra.acidez,
            muestra.grasa,
            muestra.proteina,
            muestra.cst
        )
        resultado["id_muestra"] = muestra.id_muestra or f"M-{datetime.now().strftime('%H%M%S')}"
        resultado["timestamp"] = datetime.now().isoformat()
        resultado["parametros"] = muestra.dict(exclude={"id_muestra"})
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/entrenar", response_model=TrainResponse)
def entrenar():
    """Re-entrena el modelo con nuevos datos sintéticos."""
    try:
        model = get_model()
        metrics = model.train()
        return {
            "mensaje": "Modelo re-entrenado exitosamente",
            "metrics": metrics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/modelo/info")
def info_modelo():
    """Información del modelo activo."""
    model = get_model()
    return {
        "metrics": model.get_metrics(),
        "parametros": list(model.feature_names),
        "clases": {0: "Óptima", 1: "Aceptable", 2: "Alerta", 3: "Rechazada"},
        "algoritmo": "Gradient Boosting Classifier (sklearn)",
        "referencia_normativa": "NTC 399 / Resolución 017 de 2012",
    }


@app.get("/api/modelo/referencia")
def referencia():
    """Rangos de referencia por parámetro."""
    return get_model().get_reference()


@app.get("/api/historico")
def historico(horas: int = 24):
    """Genera histórico simulado de las últimas N horas para gráficas."""
    ahora = datetime.now()
    registros = []

    # Simular variaciones a lo largo del tiempo
    for i in range(horas * 2):
        ts = ahora - timedelta(minutes=30 * (horas * 2 - i))
        hora = ts.hour
        # La temperatura sube en las horas de ordeño (5-7am, 3-5pm)
        factor_calor = 1.0 + 0.3 * math.sin(math.pi * hora / 12)
        temp = round(3.5 + random.gauss(0, 0.5) * factor_calor, 2)
        temp = max(1.0, min(temp, 8.0))
        registros.append({
            "timestamp": ts.isoformat(),
            "temperatura": temp,
            "ph": round(6.7 + random.gauss(0, 0.05), 2),
            "conductividad": round(4.8 + random.gauss(0, 0.3), 2),
            "acidez": round(0.155 + random.gauss(0, 0.01), 3),
        })

    return registros


@app.get("/api/estadisticas")
def estadisticas():
    """Estadísticas del sistema (simuladas para demo)."""
    return {
        "muestras_hoy": random.randint(18, 35),
        "muestras_semana": random.randint(120, 180),
        "distribucion_calidad": {
            "Óptima": random.randint(40, 60),
            "Aceptable": random.randint(20, 35),
            "Alerta": random.randint(8, 18),
            "Rechazada": random.randint(2, 8),
        },
        "promedio_score": round(random.uniform(72, 88), 1),
        "alertas_activas": random.randint(0, 3),
    }


if __name__ == "__main__":
    import uvicorn
    print("🐄 Iniciando sistema de calidad de leche...")
    print("📊 Cargando modelo IA...")
    get_model()  # Pre-cargar modelo
    print("✅ Modelo listo")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
