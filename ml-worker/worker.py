import os
import json
import io
import base64
from azure.servicebus import ServiceBusClient
from azure.storage.blob import BlobServiceClient
from ultralytics import YOLO
from PIL import Image

# Config from environment
STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
SERVICEBUS_CONNECTION_STRING = os.getenv("AZURE_SERVICEBUS_CONNECTION_STRING")
SERVICEBUS_QUEUE_NAME = os.getenv("SERVICEBUS_QUEUE_NAME", "defect-jobs")
UPLOAD_CONTAINER = "uploads"
RESULTS_CONTAINER = "results"
MODEL_PATH = "model/best_defect_model.pt"

print("Loading YOLO model...")
model = YOLO(MODEL_PATH)
print("Model loaded. Worker is listening for jobs...")


def run_inference(image_bytes: bytes) -> dict:
    """Run YOLO inference on raw image bytes."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    results = model.predict(image)
    result = results[0]

    has_defect = len(result.boxes) > 0
    confidences = [float(box.conf[0]) for box in result.boxes]
    avg_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0

    # Annotated image → base64
    annotated_array = result.plot()
    annotated_img = Image.fromarray(annotated_array[..., ::-1])
    buffered = io.BytesIO()
    annotated_img.save(buffered, format="JPEG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return {
        "defect": has_defect,
        "confidence": avg_confidence,
        "detections_count": len(result.boxes),
        "annotated_image_base64": img_b64,
        "status": "done"
    }


def process_job(job_id: str, blob_name: str):
    """Download image, run inference, upload result."""
    blob_service = BlobServiceClient.from_connection_string(STORAGE_CONNECTION_STRING)

    # Download original image from uploads container
    upload_container = blob_service.get_container_client(UPLOAD_CONTAINER)
    image_bytes = upload_container.get_blob_client(blob_name).download_blob().readall()

    # Run inference
    result = run_inference(image_bytes)
    result["job_id"] = job_id
    result["blob_name"] = blob_name

    # Upload annotated image to results container
    annotated_blob_name = f"{job_id}_annotated.jpg"
    annotated_bytes = base64.b64decode(result["annotated_image_base64"])
    results_container = blob_service.get_container_client(RESULTS_CONTAINER)
    results_container.upload_blob(name=annotated_blob_name, data=annotated_bytes, overwrite=True)

    # Save JSON result to results container
    results_container.upload_blob(
        name=f"{job_id}.json",
        data=json.dumps(result),
        overwrite=True
    )
    print(f"Job {job_id} completed. Defect: {result['defect']}, Confidence: {result['confidence']}")


def main():
    with ServiceBusClient.from_connection_string(SERVICEBUS_CONNECTION_STRING) as client:
        receiver = client.get_queue_receiver(
            queue_name=SERVICEBUS_QUEUE_NAME,
            max_wait_time=5
        )
        with receiver:
            print("Listening on Service Bus queue...")
            for message in receiver:
                try:
                    body = json.loads(str(message))
                    job_id = body["job_id"]
                    blob_name = body["blob_name"]
                    print(f"Processing job: {job_id}")
                    process_job(job_id, blob_name)
                    receiver.complete_message(message)
                except Exception as e:
                    print(f"Error processing message: {e}")
                    receiver.abandon_message(message)


if __name__ == "__main__":
    while True:
        main()
