from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import check_connection
from app.routers import speech, stt, campaigns

app = FastAPI(title="OBD Suite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(speech.router)
app.include_router(stt.router)
app.include_router(campaigns.router)


@app.get("/health")
def health():
    return {"status": "ok", "mongodb_connected": check_connection()}
