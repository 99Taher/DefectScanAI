import uuid
import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from azure.storage.blob import BlobServiceClient
from azure.servicebus import ServiceBusClient, ServiceBusMessage
import json

app = FastAPI(title="Defect Detection API")

# Allow up to 50MB uploads
@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    if request.method == "POST":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 50 * 1024 * 1024:
            return JSONResponse({"detail": "File too large. Max 50MB."}, status_code=413)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Azure configuration from environment variables
STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
SERVICEBUS_CONNECTION_STRING = os.getenv("AZURE_SERVICEBUS_CONNECTION_STRING")
SERVICEBUS_QUEUE_NAME = os.getenv("SERVICEBUS_QUEUE_NAME", "defect-jobs")
UPLOAD_CONTAINER = "uploads"
RESULTS_CONTAINER = "results"


def get_blob_client():
    return BlobServiceClient.from_connection_string(STORAGE_CONNECTION_STRING)


def get_job_status(job_id: str) -> dict | None:
    """Fetch result JSON from blob storage."""
    try:
        blob_client = get_blob_client()
        container = blob_client.get_container_client(RESULTS_CONTAINER)
        blob = container.get_blob_client(f"{job_id}.json")
        data = blob.download_blob().readall()
        return json.loads(data)
    except Exception:
        return None


@app.get("/")
def read_root():
    return {"message": "Defect Detection API - async mode. Use POST /images to submit a job."}


@app.post("/images")
async def upload_image(file: UploadFile = File(...)):
    """Upload image, queue a job, return job_id immediately."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    job_id = str(uuid.uuid4())
    blob_name = f"{job_id}{os.path.splitext(file.filename)[1] or '.jpg'}"

    try:
        # 1. Upload image to Azure Blob Storage
        contents = await file.read()
        blob_client = get_blob_client()
        container = blob_client.get_container_client(UPLOAD_CONTAINER)
        container.upload_blob(name=blob_name, data=contents, overwrite=True)

        # 2. Send job message to Service Bus queue
        message_body = json.dumps({
            "job_id": job_id,
            "blob_name": blob_name
        })
        with ServiceBusClient.from_connection_string(SERVICEBUS_CONNECTION_STRING) as sb_client:
            sender = sb_client.get_queue_sender(queue_name=SERVICEBUS_QUEUE_NAME)
            with sender:
                sender.send_messages(ServiceBusMessage(message_body))

        return {"job_id": job_id, "status": "queued"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results/{job_id}")
def get_result(job_id: str):
    """Poll for the result of a submitted job."""
    result = get_job_status(job_id)
    if result is None:
        return {"job_id": job_id, "status": "processing"}
    return result
