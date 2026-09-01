import hmac
import io

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.auth.dependencies import get_current_user, has_permission, require_permission
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.client import check_connection
from app.modules.campaigns import service
from app.modules.campaigns.schemas import CampaignCreate, VoiceSourceUpdate
from app.shared.audio import range_response
from app.shared.mongo import to_object_id
from app.shared.signing import verify_signed_params

router = APIRouter(tags=["obd-campaigns"])


@router.post("/api/campaigns")
def create_campaign(payload: CampaignCreate, user: dict = Depends(require_permission("campaigns", "create"))):
    return service.create_campaign(user, payload.name)


@router.get("/api/campaigns")
def list_campaigns(user: dict = Depends(require_permission("campaigns", "view"))):
    return service.list_campaigns(user)


@router.patch("/api/campaigns/{campaign_id}/voice-source")
def set_voice_source(campaign_id: str, payload: VoiceSourceUpdate, user: dict = Depends(require_permission("campaigns", "edit"))):
    folder_name = service.set_voice_source(user, to_object_id(campaign_id, "campaign id"), payload.voice_source_folder_id)
    return {"message": f"This campaign will now use voices from the folder '{folder_name}'"}


@router.get("/api/campaigns/{campaign_id}/audio")
@limiter.limit("30/minute")
def get_campaign_audio(
    campaign_id: str,
    request: Request,
    exp: str | None = Query(default=None),
    sig: str | None = Query(default=None),
):
    """Two ways in, on purpose:

    1. A valid short-lived `exp`/`sig` pair — this is how Sarv's phone
       system fetches the file mid-call; it can't send our login header,
       so it gets a signed link (built in campaigns/service.py::run_calls)
       that expires instead of working forever.
    2. A normal Firebase bearer token belonging to the campaign's owner
       (or an admin) — this is how the in-app preview/download works.

    Anonymous requests with no signature and no valid session are rejected.
    """
    oid = to_object_id(campaign_id, "campaign id")
    if not verify_signed_params(f"campaign:{campaign_id}", exp, sig):
        user = get_current_user(request)
        if not has_permission(user, "campaigns", "view"):
            raise HTTPException(403, "You don't have access to campaigns.")
        from app.modules.campaigns import repository as _repo
        campaign = _repo.find_public(oid)
        if not campaign:
            raise HTTPException(404, "Campaign not found")
        if user["role"] not in ("super_admin", "admin") and campaign.get("created_by") != user["uid"]:
            raise HTTPException(404, "Campaign not found")

    audio_bytes, media_type, filename = service.get_campaign_audio(oid)
    return range_response(request, audio_bytes, media_type, filename)


@router.post("/api/campaigns/{campaign_id}/upload-audio")
async def upload_audio(campaign_id: str, file: UploadFile = File(...), user: dict = Depends(require_permission("campaigns", "edit"))):
    audio_bytes = await file.read()
    service.upload_audio(user, to_object_id(campaign_id, "campaign id"), file.filename, audio_bytes, file.content_type)
    return {"message": "Audio uploaded", "filename": file.filename}


@router.post("/api/campaigns/{campaign_id}/upload-contacts")
async def upload_contacts(campaign_id: str, file: UploadFile = File(...), user: dict = Depends(require_permission("campaigns", "edit"))):
    content = await file.read()
    message = service.upload_contacts(user, to_object_id(campaign_id, "campaign id"), file.filename, content)
    return {"message": message}


@router.delete("/api/campaigns/{campaign_id}/contacts")
def delete_contacts(campaign_id: str, user: dict = Depends(require_permission("campaigns", "edit"))):
    deleted = service.delete_contacts(user, to_object_id(campaign_id, "campaign id"))
    return {"message": f"Deleted {deleted} contact(s)"}


@router.post("/api/campaigns/{campaign_id}/start")
@limiter.limit("20/minute")
def start_campaign(campaign_id: str, request: Request, background_tasks: BackgroundTasks, user: dict = Depends(require_permission("campaigns", "trigger"))):
    count = service.start_campaign(user, campaign_id, to_object_id(campaign_id, "campaign id"), background_tasks.add_task)
    return {"message": f"Campaign started — {count} calls have been queued"}


@router.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str, user: dict = Depends(require_permission("campaigns", "delete"))):
    result = service.delete_campaign(user, to_object_id(campaign_id, "campaign id"))
    return {"message": f"Deleted campaign '{result['name']}', {result['contacts_deleted']} contact(s), and {result['logs_deleted']} call log(s)"}


@router.get("/api/campaigns/{campaign_id}/status")
def campaign_status(campaign_id: str, user: dict = Depends(require_permission("campaigns", "view"))):
    return service.campaign_status(user, to_object_id(campaign_id, "campaign id"))


@router.get("/api/campaigns/{campaign_id}/report")
def download_report(campaign_id: str, user: dict = Depends(require_permission("campaigns", "view"))):
    df = service.build_report_dataframe(user, to_object_id(campaign_id, "campaign id"))
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False, engine="openpyxl")
    buffer.seek(0)
    return StreamingResponse(
        buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=campaign_{campaign_id}_report.xlsx"},
    )


@router.get("/api/obd/overview")
def obd_overview(user: dict = Depends(require_permission("dashboard", "view"))):
    return service.obd_overview(user)


@router.get("/api/obd/daily-stats")
def obd_daily_stats(user: dict = Depends(require_permission("dashboard", "view"))):
    return service.obd_daily_stats(user)


@router.get("/api/obd/campaign-performance")
def obd_campaign_performance(user: dict = Depends(require_permission("dashboard", "view"))):
    return service.obd_campaign_performance(user)


@router.get("/api/campaigns/debug/deployment-check")
def deployment_check(user: dict = Depends(require_permission("dashboard", "view"))):
    public_base_url_set = bool(settings.public_base_url)
    webhook_secret_set = bool(settings.sarv_webhook_secret)
    sarv_configured = bool(settings.sarv_user_id and settings.sarv_user_token and settings.sarv_plan_id)
    signing_secret_set = bool(settings.download_signing_secret)
    postgres_connected = check_connection()

    checks = {
        "public_base_url_set": public_base_url_set,
        "sarv_webhook_secret_set": webhook_secret_set,
        "sarv_credentials_configured": sarv_configured,
        "download_signing_secret_set": signing_secret_set,
        "postgres_connected": postgres_connected,
    }
    return {**checks, "ready_to_call": all(checks.values())}


@router.post("/api/campaigns/webhooks/sarv-status")
@limiter.limit("300/minute")
async def sarv_status_webhook(request: Request):
    expected_key = settings.sarv_webhook_secret
    provided_key = request.query_params.get("key", "")
    if not expected_key or not hmac.compare_digest(provided_key, expected_key):
        raise HTTPException(403, "Invalid or missing webhook key")

    try:
        payload = await request.json()
    except Exception:
        form = await request.form()
        payload = dict(form)
    return service.handle_sarv_status_webhook(payload)
