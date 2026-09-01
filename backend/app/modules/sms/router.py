from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, UploadFile

from app.auth.dependencies import require_permission
from app.core.rate_limit import limiter
from app.modules.sms import service
from app.modules.sms.schemas import SMSCampaignCreate, SMSRecipients, SMSSend

router = APIRouter(prefix="/api/sms", tags=["sms"])


@router.get("/readiness")
def readiness(user: dict = Depends(require_permission("sms", "view"))):
    return service.readiness()


@router.post("/send")
@limiter.limit("10/minute")
def send_sms(request: Request, payload: SMSSend, user: dict = Depends(require_permission("sms", "send"))):
    result = service.send_single(user, payload.recipients, payload.message, payload.template_id, payload.sender_id)
    return {"message": "SMS submitted to ValueFirst", **result}


@router.post("/campaigns")
def create_campaign(payload: SMSCampaignCreate, user: dict = Depends(require_permission("sms", "create"))):
    return service.create_campaign(user, payload.name, payload.template_id, payload.message)


@router.get("/campaigns")
def list_campaigns(user: dict = Depends(require_permission("sms", "view"))):
    return service.list_campaigns(user)


@router.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: str, user: dict = Depends(require_permission("sms", "view"))):
    return service.get_campaign_detail(campaign_id, user)


@router.post("/campaigns/{campaign_id}/recipients")
def add_recipients(campaign_id: str, payload: SMSRecipients, user: dict = Depends(require_permission("sms", "edit"))):
    return service.add_recipients(campaign_id, user, payload.recipients)


@router.post("/campaigns/{campaign_id}/upload")
async def upload_recipients(campaign_id: str, file: UploadFile = File(...), user: dict = Depends(require_permission("sms", "edit"))):
    content = await file.read()
    return service.upload_recipients(campaign_id, user, file.filename, content)


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str, user: dict = Depends(require_permission("sms", "delete"))):
    service.delete_campaign(campaign_id, user)
    return {"message": "SMS campaign deleted"}


@router.post("/campaigns/{campaign_id}/start")
@limiter.limit("20/minute")
def start_campaign(campaign_id: str, request: Request, background_tasks: BackgroundTasks, user: dict = Depends(require_permission("sms", "trigger"))):
    total = service.start_campaign(campaign_id, user, background_tasks.add_task)
    return {"message": f"Campaign started for {total} recipient(s)"}
