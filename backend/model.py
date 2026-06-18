"""
Modelo de IA nativo para evaluación de calidad de leche.
Usa regresión logística y árbol de decisión entrenados con datos sintéticos
basados en estándares reales de calidad láctea (NTC 399, Norma Colombiana).
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
import json
import pickle
import os

# ─── Parámetros de referencia (NTC 399 y estándares internacionales) ─────────
REFERENCE = {
    "temperatura": {"min": 0, "optimo_max": 4, "alerta": 6, "critico": 8},
    "ph":          {"min": 6.4, "optimo_min": 6.6, "optimo_max": 6.8, "max": 7.0},
    "conductividad": {"min": 4.0, "optimo_max": 5.5, "alerta": 6.5, "max": 8.0},
    "acidez":      {"min": 0.13, "optimo_max": 0.18, "alerta": 0.20, "max": 0.25},
    "grasa":       {"min": 2.5, "optimo_min": 3.2, "optimo_max": 4.2, "max": 6.0},
    "proteina":    {"min": 2.8, "optimo_min": 3.0, "optimo_max": 3.8, "max": 5.0},
    "cst":         {"min": 0, "optimo_max": 200, "alerta": 500, "max": 1000},  # Conteo Somático Total (miles)
}

CLASES = {0: "Óptima", 1: "Aceptable", 2: "Alerta", 3: "Rechazada"}
COLORES = {0: "#22c55e", 1: "#84cc16", 2: "#f59e0b", 3: "#ef4444"}


def generar_datos_sinteticos(n=2000, seed=42):
    """
    Genera dataset sintético basado en distribuciones reales de parámetros lácteos.
    Clases: 0=Óptima, 1=Aceptable, 2=Alerta, 3=Rechazada
    """
    rng = np.random.default_rng(seed)
    X, y = [], []

    proporciones = [0.35, 0.30, 0.20, 0.15]
    counts = [int(n * p) for p in proporciones]

    for clase, count in enumerate(counts):
        for _ in range(count):
            if clase == 0:  # Óptima
                temp = rng.uniform(0.5, 4.0)
                ph = rng.uniform(6.6, 6.8)
                cond = rng.uniform(4.0, 5.5)
                acidez = rng.uniform(0.13, 0.17)
                grasa = rng.uniform(3.2, 4.2)
                proteina = rng.uniform(3.0, 3.8)
                cst = rng.uniform(50, 200)
            elif clase == 1:  # Aceptable
                temp = rng.uniform(3.5, 6.0)
                ph = rng.choice([rng.uniform(6.4, 6.6), rng.uniform(6.8, 7.0)])
                cond = rng.uniform(5.0, 6.5)
                acidez = rng.uniform(0.16, 0.20)
                grasa = rng.uniform(2.5, 3.2)
                proteina = rng.uniform(2.8, 3.0)
                cst = rng.uniform(150, 500)
            elif clase == 2:  # Alerta
                temp = rng.uniform(5.5, 7.5)
                ph = rng.choice([rng.uniform(6.2, 6.4), rng.uniform(7.0, 7.2)])
                cond = rng.uniform(6.0, 7.5)
                acidez = rng.uniform(0.18, 0.23)
                grasa = rng.uniform(2.0, 2.5)
                proteina = rng.uniform(2.5, 2.8)
                cst = rng.uniform(450, 800)
            else:  # Rechazada
                temp = rng.uniform(7.0, 15.0)
                ph = rng.choice([rng.uniform(5.8, 6.2), rng.uniform(7.2, 7.8)])
                cond = rng.uniform(7.0, 9.0)
                acidez = rng.uniform(0.21, 0.30)
                grasa = rng.choice([rng.uniform(1.5, 2.0), rng.uniform(5.5, 7.0)])
                proteina = rng.uniform(2.0, 2.5)
                cst = rng.uniform(750, 1200)

            X.append([temp, ph, cond, acidez, grasa, proteina, cst])
            y.append(clase)

    return np.array(X), np.array(y)


def calcular_score_parcial(nombre, valor):
    """Calcula score 0-100 para cada parámetro individualmente."""
    r = REFERENCE.get(nombre, {})
    if not r:
        return 100

    if nombre == "temperatura":
        if valor <= r["optimo_max"]: return 100
        elif valor <= r["alerta"]: return 60
        elif valor <= r["critico"]: return 25
        else: return 0
    elif nombre == "ph":
        if r["optimo_min"] <= valor <= r["optimo_max"]: return 100
        elif r["min"] <= valor < r["optimo_min"] or r["optimo_max"] < valor <= r["max"]: return 60
        else: return 15
    elif nombre == "conductividad":
        if valor <= r["optimo_max"]: return 100
        elif valor <= r["alerta"]: return 55
        elif valor <= r["max"]: return 25
        else: return 0
    elif nombre == "acidez":
        if valor <= r["optimo_max"]: return 100
        elif valor <= r["alerta"]: return 50
        else: return 0
    elif nombre == "grasa":
        if r["optimo_min"] <= valor <= r["optimo_max"]: return 100
        elif r["min"] <= valor or valor <= r["max"]: return 60
        else: return 20
    elif nombre == "proteina":
        if r["optimo_min"] <= valor <= r["optimo_max"]: return 100
        elif r["min"] <= valor: return 65
        else: return 20
    elif nombre == "cst":
        if valor <= r["optimo_max"]: return 100
        elif valor <= r["alerta"]: return 50
        else: return 0
    return 100


class MilkQualityModel:
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.pkl")

    def __init__(self):
        self.pipeline = None
        self.feature_names = ["temperatura", "ph", "conductividad", "acidez", "grasa", "proteina", "cst"]
        self.trained = False
        self.metrics = {}
        self._load_or_train()

    def _load_or_train(self):
        if os.path.exists(self.MODEL_PATH):
            with open(self.MODEL_PATH, "rb") as f:
                data = pickle.load(f)
                self.pipeline = data["pipeline"]
                self.metrics = data["metrics"]
                self.trained = True
        else:
            self.train()

    def train(self):
        X, y = generar_datos_sinteticos(n=2500)

        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", GradientBoostingClassifier(
                n_estimators=200,
                max_depth=4,
                learning_rate=0.08,
                random_state=42
            ))
        ])

        scores = cross_val_score(self.pipeline, X, y, cv=5, scoring="accuracy")
        self.pipeline.fit(X, y)

        self.metrics = {
            "accuracy": round(float(scores.mean()), 4),
            "std": round(float(scores.std()), 4),
            "n_samples": len(X),
            "algorithm": "Gradient Boosting Classifier",
        }
        self.trained = True

        with open(self.MODEL_PATH, "wb") as f:
            pickle.dump({"pipeline": self.pipeline, "metrics": self.metrics}, f)

        return self.metrics

    def predict(self, temperatura, ph, conductividad, acidez, grasa, proteina, cst):
        if not self.trained:
            raise RuntimeError("Modelo no entrenado")

        X = np.array([[temperatura, ph, conductividad, acidez, grasa, proteina, cst]])
        clase = int(self.pipeline.predict(X)[0])
        probs = self.pipeline.predict_proba(X)[0].tolist()

        # Scores individuales por parámetro
        scores_individuales = {
            nombre: calcular_score_parcial(nombre, val)
            for nombre, val in zip(self.feature_names, X[0])
        }
        score_global = int(np.mean(list(scores_individuales.values())))

        # Detectar parámetros críticos
        criticos = [k for k, v in scores_individuales.items() if v < 40]
        alertas = [k for k, v in scores_individuales.items() if 40 <= v < 70]

        # Recomendaciones automáticas
        recomendaciones = self._generar_recomendaciones(
            temperatura, ph, conductividad, acidez, grasa, proteina, cst
        )

        return {
            "clase": clase,
            "etiqueta": CLASES[clase],
            "color": COLORES[clase],
            "probabilidades": {CLASES[i]: round(p * 100, 1) for i, p in enumerate(probs)},
            "score_global": score_global,
            "scores_individuales": scores_individuales,
            "parametros_criticos": criticos,
            "parametros_en_alerta": alertas,
            "recomendaciones": recomendaciones,
            "modelo": self.metrics,
        }

    def _generar_recomendaciones(self, temp, ph, cond, acidez, grasa, proteina, cst):
        recs = []
        r = REFERENCE

        if temp > r["temperatura"]["alerta"]:
            recs.append("🌡️ Temperatura crítica: verificar cadena de frío inmediatamente. Meta: < 4°C.")
        elif temp > r["temperatura"]["optimo_max"]:
            recs.append("🌡️ Temperatura elevada: revisar equipo de refrigeración. Objetivo: 2–4°C.")

        if ph < r["ph"]["min"]:
            recs.append("⚗️ pH muy ácido: posible fermentación prematura. Revisar higiene del ordeño.")
        elif ph > r["ph"]["max"]:
            recs.append("⚗️ pH alcalino: posible mastitis o contaminación con agua. Verificar fuente.")

        if cond > r["conductividad"]["alerta"]:
            recs.append("⚡ Conductividad alta: indicador de mastitis. Realizar prueba de California.")

        if acidez > r["acidez"]["alerta"]:
            recs.append("🧪 Acidez elevada: leche en proceso de deterioro. No apta para procesamiento.")

        if grasa < r["grasa"]["min"]:
            recs.append("🥛 Grasa baja: revisar alimentación del hato o posible adulteración con agua.")

        if proteina < r["proteina"]["min"]:
            recs.append("🔬 Proteína baja: evaluar nutrición animal y estado sanitario del hato.")

        if cst > r["cst"]["alerta"]:
            recs.append("🦠 CST elevado: alto recuento de células somáticas. Tratamiento veterinario urgente.")

        if not recs:
            recs.append("✅ Todos los parámetros dentro del rango óptimo. Leche lista para procesamiento.")

        return recs

    def get_metrics(self):
        return self.metrics

    def get_reference(self):
        return REFERENCE


# Singleton
_model_instance = None

def get_model():
    global _model_instance
    if _model_instance is None:
        _model_instance = MilkQualityModel()
    return _model_instance
