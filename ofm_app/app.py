"""
OFM + Makro PRO 상품 조회 사내 앱 - FastAPI 서버

실행:
    python app.py

접속:
    http://localhost:8000        (웹 UI)
    http://localhost:8000/docs   (API 문서)
"""

import io
import requests
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment

import ofm_core
import makro_core
import cache


app = FastAPI(
    title="OFM + Makro PRO 상품 조회 시스템",
    description="OfficeMate / Makro PRO 상품 정보 조회 및 일괄 처리 (Neobiotech Thailand)",
    version="2.0.0",
)


# ============================================================
# 웹 UI
# ============================================================

@app.get("/", response_class=HTMLResponse)
def index():
    html_file = Path(__file__).parent / "templates" / "index.html"
    return html_file.read_text(encoding="utf-8")


# ============================================================
# OFM 엔드포인트
# ============================================================

@app.get("/api/ofm/product/{product_id}")
def ofm_get_product(product_id: str, refresh: bool = False):
    if not product_id.isdigit():
        raise HTTPException(400, "OFM 상품번호는 숫자여야 합니다")

    if not refresh:
        cached = cache.get("ofm", product_id)
        if cached:
            return {**cached, "from_cache": True, "source": "ofm"}

    data = ofm_core.fetch_product_detail(product_id)
    if not data.get("error"):
        cache.set("ofm", product_id, data)
    return {**data, "from_cache": False, "source": "ofm"}


@app.get("/api/ofm/search")
def ofm_search(q: str, limit: int = 30, with_price: bool = True):
    if not q or len(q.strip()) < 2:
        raise HTTPException(400, "검색어는 2글자 이상")
    results = ofm_core.search_products(q.strip(), max_results=limit, with_price=with_price)
    for p in results:
        if p.get("id") and not p.get("error") and p.get("price"):
            cache.set("ofm", p["id"], p)
    return {"source": "ofm", "query": q, "count": len(results), "results": results}


# ============================================================
# Makro 엔드포인트
# ============================================================

@app.get("/api/makro/product/{product_id}")
def makro_get_product(product_id: str, refresh: bool = False):
    if not product_id:
        raise HTTPException(400, "상품번호를 입력하세요")

    if not refresh:
        cached = cache.get("makro", product_id)
        if cached:
            return {**cached, "from_cache": True, "source": "makro"}

    data = makro_core.fetch_product_detail(product_id)
    if not data.get("error"):
        cache.set("makro", product_id, data)
    return {**data, "from_cache": False, "source": "makro"}


@app.get("/api/makro/search")
def makro_search(q: str, limit: int = 30):
    if not q or len(q.strip()) < 2:
        raise HTTPException(400, "검색어는 2글자 이상")
    results = makro_core.search_products(q.strip(), max_results=limit)
    # 에러 케이스 처리
    if results and results[0].get("error"):
        raise HTTPException(500, results[0]["error"])
    for p in results:
        if p.get("id"):
            cache.set("makro", p["id"], p)
    return {"source": "makro", "query": q, "count": len(results), "results": results}


# ============================================================
# 선택 상품 엑셀 내보내기 (이미지 포함)
# ============================================================

@app.post("/api/export")
async def export_selected(request_body: dict):
    """
    선택한 상품 목록을 이미지 포함 엑셀로 내보내기.
    요청: { "source": "ofm"|"makro", "items": [ {id, name, brand, price, ...}, ... ] }
    """
    from openpyxl.drawing.image import Image as XlImage
    from openpyxl.utils import get_column_letter

    source = request_body.get("source", "ofm")
    items = request_body.get("items", [])
    if not items:
        raise HTTPException(400, "선택된 상품이 없습니다")

    wb = Workbook()
    ws = wb.active
    ws.title = f"{source.upper()} 선택상품"

    headers = ["이미지", "상품번호", "상품명", "브랜드", "단가(THB)", "수량", "합계(THB)", "정가", "할인%", "재고상태", "URL"]
    ws.append(headers)

    # 헤더 스타일
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78" if source == "ofm" else "C0392B")
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # 열 너비
    widths = [12, 14, 45, 18, 12, 8, 14, 10, 8, 12, 45]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.row_dimensions[1].height = 22

    grand_total = 0
    row_num = 2
    for p in items:
        price_val = float(p.get("price") or 0)
        qty_val = int(p.get("qty") or 0)
        subtotal = price_val * qty_val
        grand_total += subtotal

        ws.append([
            "",  # 이미지 칸 (아래서 삽입)
            p.get("id", ""),
            p.get("name", ""),
            p.get("brand", ""),
            price_val if price_val else "",
            qty_val if qty_val else "",
            subtotal if subtotal else "",
            p.get("origin_price", ""),
            f"{p['discount_pct']}%" if p.get("discount_pct") else "",
            p.get("availability", ""),
            p.get("url", ""),
        ])

        # 행 높이 (이미지 맞춤)
        ws.row_dimensions[row_num].height = 60

        # 이미지 다운로드 & 삽입
        img_url = p.get("image")
        if img_url:
            try:
                img_resp = requests.get(img_url, timeout=5, headers={
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://www.ofm.co.th/" if source == "ofm" else "https://www.makro.pro/",
                })
                if img_resp.status_code == 200 and len(img_resp.content) > 100:
                    img_data = io.BytesIO(img_resp.content)
                    img = XlImage(img_data)
                    img.width = 60
                    img.height = 60
                    ws.add_image(img, f"A{row_num}")
            except Exception:
                pass

        # 세로 중앙 정렬
        for cell in ws[row_num]:
            cell.alignment = Alignment(vertical="center", wrap_text=True)

        # 단가/합계 숫자 포맷
        ws.cell(row=row_num, column=5).number_format = '#,##0.00'
        ws.cell(row=row_num, column=7).number_format = '#,##0.00'

        row_num += 1

    # 합계 행
    total_row = ["", "", "", "총 합계", "", "", grand_total, "", "", "", ""]
    ws.append(total_row)
    total_font = Font(bold=True, size=12)
    ws.cell(row=row_num, column=4).font = total_font
    ws.cell(row=row_num, column=7).font = Font(bold=True, size=12, color="CC0000")
    ws.cell(row=row_num, column=7).number_format = '#,##0.00'

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    from urllib.parse import quote as urlquote
    filename = f"{source}_selected_{len(items)}items.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{urlquote(filename)}"},
    )


# ============================================================
# 엑셀 일괄 조회 (OFM/Makro 통합)
# ============================================================

@app.post("/api/batch")
async def batch_upload(
    file: UploadFile = File(...),
    source: str = Query("ofm", pattern="^(ofm|makro)$"),
):
    """
    엑셀 업로드 → 일괄 조회 → 결과 엑셀 다운로드.
    - source=ofm: OFM에서 조회
    - source=makro: Makro PRO에서 조회

    입력: A열에 상품번호 (첫 행은 헤더)
    출력: 상품번호 | 상품명 | 가격 | 정가 | 할인% | 재고 | 브랜드 | 이미지 | URL | 에러
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "엑셀 파일(.xlsx)만 지원")

    content = await file.read()
    try:
        wb_in = load_workbook(io.BytesIO(content), data_only=True)
        ws_in = wb_in.active
    except Exception as e:
        raise HTTPException(400, f"엑셀 읽기 실패: {e}")

    # 상품번호 추출
    product_ids = []
    for row in ws_in.iter_rows(min_row=2, max_col=1, values_only=True):
        cell = row[0]
        if cell is None:
            continue
        val = str(cell).strip().replace(".0", "")
        if val:
            product_ids.append(val)

    if not product_ids:
        raise HTTPException(400, "A열에 상품번호가 없습니다")

    # 결과 엑셀
    wb_out = Workbook()
    ws_out = wb_out.active
    ws_out.title = f"{source.upper()} 조회결과"

    headers = ["상품번호", "상품명", "브랜드", "가격(THB)", "정가", "할인%", "재고", "이미지URL", "상품URL", "에러"]
    ws_out.append(headers)

    widths = [15, 45, 18, 12, 10, 8, 10, 45, 45, 30]
    for i, w in enumerate(widths, 1):
        ws_out.column_dimensions[chr(64 + i)].width = w

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78" if source == "ofm" else "C0392B")
    for cell in ws_out[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # 각 상품 조회
    for pid in product_ids:
        # 캐시 우선
        cached = cache.get(source, pid)
        if cached:
            data = cached
        else:
            if source == "ofm":
                if not pid.isdigit():
                    data = {"id": pid, "error": "OFM은 숫자 상품번호만 지원"}
                else:
                    data = ofm_core.fetch_product_detail(pid)
            else:  # makro
                data = makro_core.fetch_product_detail(pid)

            if not data.get("error"):
                cache.set(source, pid, data)

        ws_out.append([
            data.get("id", pid),
            data.get("name") or "",
            data.get("brand") or "",
            data.get("price") or "",
            data.get("origin_price") or "",
            f"{data.get('discount_pct')}%" if data.get("discount_pct") else "",
            data.get("inventory") if data.get("inventory") is not None else (data.get("availability") or ""),
            data.get("image") or "",
            data.get("url") or "",
            data.get("error") or "",
        ])

    buf = io.BytesIO()
    wb_out.save(buf)
    buf.seek(0)

    from urllib.parse import quote as urlquote
    filename = f"{source}_result_{len(product_ids)}items.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{urlquote(filename)}"},
    )


@app.get("/api/template")
def download_template(source: str = Query("ofm", pattern="^(ofm|makro)$")):
    """엑셀 템플릿 다운로드."""
    wb = Workbook()
    ws = wb.active
    ws.title = f"{source.upper()} 상품번호"
    ws.append(["상품번호"])

    if source == "ofm":
        samples = [5096335, 5096484, 5096723]
    else:
        samples = [929262, 905480]

    for s in samples:
        ws.append([s])

    ws["A1"].font = Font(bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor="1F4E78" if source == "ofm" else "C0392B")
    ws.column_dimensions["A"].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={source}_batch_template.xlsx"},
    )


# ============================================================
# 캐시
# ============================================================

@app.get("/api/cache/stats")
def cache_stats():
    return cache.stats()


@app.delete("/api/cache")
def cache_clear(source: str = None):
    """source 지정 시 해당 소스만 삭제, 없으면 전체."""
    cache.clear(source=source)
    return {"message": f"{source or '전체'} 캐시 삭제됨"}


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("OFM + Makro PRO 상품 조회 시스템 v2.0")
    print("=" * 60)
    print("웹 UI:      http://localhost:8000")
    print("API 문서:   http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
