import re

from fastapi import Request, Response


def range_response(request: Request, data: bytes, media_type: str, filename: str) -> Response:
    total = len(data)
    range_header = request.headers.get("range")
    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
    }

    if range_header:
        match = re.match(r"bytes=(\d*)-(\d*)", range_header)
        if match:
            start_str, end_str = match.groups()
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else total - 1
            end = min(end, total - 1)
            if start <= end < total:
                chunk = data[start: end + 1]
                headers = {
                    **base_headers,
                    "Content-Range": f"bytes {start}-{end}/{total}",
                    "Content-Length": str(len(chunk)),
                }
                return Response(content=chunk, status_code=206, media_type=media_type, headers=headers)

    return Response(
        content=data,
        media_type=media_type,
        headers={**base_headers, "Content-Length": str(total)},
    )
