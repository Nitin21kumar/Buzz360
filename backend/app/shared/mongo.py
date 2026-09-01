from bson import ObjectId
from bson.errors import InvalidId

from app.core.exceptions import ValidationError


def to_object_id(value: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise ValidationError(f"Invalid {label}")
