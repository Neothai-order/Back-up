"""
OFM 스크래퍼 코어 모듈 (v2 - BySkuCode API 사용)

주요 개선:
- 상세 조회를 HTML 파싱이 아닌 공식 API 호출로 변경
- 정확한 재고 수량 (qty), 상태 (display_status), 할인가 (price_discount) 제공
- 훨씬 빠르고 안정적

API:
- 상세: GET https://apis.ofm.co.th/product/api/v1/Products/BySkuCode?skuCode={id}
- 검색: Playwright 필요 (검색 API는 키워드가 헤더/쿠키에 있어서 복잡)
"""

import json
import re
import time
import threading
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup


API_DETAIL_URL = "https://apis.ofm.co.th/product/api/v1/Products/BySkuCode"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "th,en;q=0.9",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.ofm.co.th/",
}

# Bearer 토큰 캐시 (OFM API 인증 필요)
_token_cache = {"token": None, "fetched_at": 0}
_token_lock = threading.Lock()


def _get_bearer_token() -> str | None:
    """Playwright로 OFM 사이트 접속하여 Bearer 토큰 획득. 1시간 캐시. 스레드 안전."""
    now = time.time()
    if _token_cache["token"] and (now - _token_cache["fetched_at"]) < 3600:
        return _token_cache["token"]

    with _token_lock:
        # 락 획득 후 재확인 (다른 스레드가 이미 갱신했을 수 있음)
        now = time.time()
        if _token_cache["token"] and (now - _token_cache["fetched_at"]) < 3600:
            return _token_cache["token"]

        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("[!] playwright 미설치")
            return None

        token = None
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(user_agent=HEADERS["User-Agent"])
                tokens = []

                def on_req(req):
                    auth = req.headers.get("authorization", "")
                    if auth.startswith("Bearer "):
                        tokens.append(auth)

                page.on("request", on_req)
                page.goto("https://www.ofm.co.th/", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(3000)
                browser.close()

            if tokens:
                token = tokens[-1]
                _token_cache["token"] = token
                _token_cache["fetched_at"] = time.time()
                print(f"[*] OFM Bearer 토큰 획득 완료")
        except Exception as e:
            print(f"[!] OFM 토큰 획득 실패: {e}")

        return token


# 상태 코드 → 한글 매핑
STATUS_MAP = {
    "ready_to_ship": "즉시배송",
    "pre_order": "예약판매",
    "out_of_stock": "품절",
    "sold_out": "품절",
    "unavailable": "판매중지",
}


# ============================================================
# 상품 상세 조회 (공식 API)
# ============================================================

def fetch_product_detail(product_id: str) -> dict:
    """
    OFM BySkuCode API로 상품 상세 조회.
    반환: {id, name, price, origin_price, discount_pct, inventory, availability, image, url, ...}
    """
    token = _get_bearer_token()
    if not token:
        return {"id": product_id, "error": "OFM 인증 토큰 획득 실패"}

    headers = {**HEADERS, "Authorization": token}
    params = {
        "accountChannel": "standard",
        "skuCode": product_id,
        "userOpenId": "",
        "accountId": "",
        "userCategoryType": "Standard",
    }

    try:
        r = requests.get(API_DETAIL_URL, params=params, headers=headers, timeout=20)
        if r.status_code == 401:
            # 토큰 만료 → 재획득 후 재시도
            _token_cache["token"] = None
            token = _get_bearer_token()
            if not token:
                return {"id": product_id, "error": "OFM 인증 토큰 재획득 실패"}
            headers["Authorization"] = token
            r = requests.get(API_DETAIL_URL, params=params, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
    except requests.HTTPError as e:
        if e.response.status_code == 404:
            return {"id": product_id, "error": "상품을 찾을 수 없음"}
        return {"id": product_id, "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        return {"id": product_id, "error": f"요청 실패: {e}"}

    return _parse_api_response(data, product_id)


def _parse_api_response(data: dict, product_id: str) -> dict:
    """BySkuCode API 응답 파싱."""
    if not isinstance(data, dict):
        return {"id": product_id, "error": "응답 형식 오류"}

    # 이름 (태국어/영어)
    names = data.get("product_names", {}) or {}
    name = names.get("th") or names.get("en")

    # 브랜드
    brand_info = data.get("brand", {}) or {}
    brand_names = brand_info.get("display_name", {}) or {}
    brand = brand_names.get("en") or brand_names.get("th")

    # 카테고리
    cat = data.get("categories", {}) or {}
    cat_names = cat.get("display_name", {}) or {}
    category = cat_names.get("en") or cat_names.get("th")

    # 설명
    content = data.get("content", {}) or {}
    desc_dict = content.get("description", {}) if isinstance(content.get("description"), dict) else {}
    description = None
    if isinstance(desc_dict, dict):
        description = desc_dict.get("th") or desc_dict.get("en")
    elif isinstance(content.get("description"), str):
        description = content.get("description")

    # SKU 정보 (첫 번째 SKU가 기본)
    skus = data.get("skus", []) or []
    if not skus:
        return {
            "id": product_id,
            "name": name,
            "brand": brand,
            "error": "SKU 정보 없음",
        }

    sku = skus[0]

    # 가격
    display_price = sku.get("display_price_include_vat") or sku.get("price_include_vat")
    discount_price = sku.get("price_discount_include_vat")
    price = discount_price if discount_price else display_price
    origin_price = display_price if discount_price else None

    discount_pct = None
    if discount_price and display_price and display_price > discount_price:
        discount_pct = round((display_price - discount_price) / display_price * 100)

    # 재고
    qty = sku.get("qty", 0) or 0
    can_buy = sku.get("can_buy", False)
    display_status = sku.get("display_status", "")
    is_available_stock = sku.get("is_available_stock", False)

    # 재고 상태 결정
    if not can_buy:
        availability = STATUS_MAP.get(display_status, "판매중지")
    elif qty > 0:
        availability = f"재고 {qty}개"
    elif is_available_stock:
        # qty=0이지만 is_available_stock=True → 드롭십 상품
        availability = STATUS_MAP.get(display_status, "재고있음")
    else:
        availability = STATUS_MAP.get(display_status, "품절")

    # 이미지
    files = data.get("files", []) or []
    image = None
    for f in files:
        if isinstance(f, dict):
            url = f.get("url")
            size = f.get("size", "")
            if url and ("large" in size.lower() or "medium" in size.lower() or not size):
                image = url
                break
    # 이미지 못 찾았으면 첫 파일
    if not image and files:
        f0 = files[0]
        if isinstance(f0, dict):
            image = f0.get("url")

    # 이미지 폴백: CDN 규칙
    if not image:
        image = f"https://pim-cdn0.ofm.co.th/products/large/{product_id}.jpg"

    return {
        "id": product_id,
        "sku": product_id,
        "internal_id": data.get("id", ""),  # 예: P21101305955626
        "name": name,
        "brand": brand,
        "category": category,
        "price": str(price) if price is not None else None,
        "origin_price": str(origin_price) if origin_price is not None else None,
        "discount_pct": discount_pct,
        "currency": "THB",
        "inventory": qty,
        "availability": availability,
        "can_buy": can_buy,
        "display_status": display_status,
        "image": image,
        "url": f"https://www.ofm.co.th/product/p.{product_id}",
        "description": description,
    }


# ============================================================
# 상품명 검색 (Playwright - 기존과 동일)
# ============================================================

def search_products(keyword: str, max_results: int = 30, with_price: bool = True) -> list:
    """
    OFM 상품명 검색. Playwright로 페이지 렌더링 후 API 응답 추출.
    with_price=True면 BySkuCode API 병렬 호출로 정확한 가격/재고 보강.
    """
    from playwright.sync_api import sync_playwright
    from concurrent.futures import ThreadPoolExecutor, as_completed

    encoded = quote(keyword, safe="-")
    search_url = f"https://www.ofm.co.th/search/{encoded}"
    results_by_id = {}
    api_responses = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="th-TH",
            viewport={"width": 1400, "height": 900},
        )
        page = context.new_page()

        # 검색 중 Bearer 토큰도 캡처
        def handle_request(request):
            auth = request.headers.get("authorization", "")
            if auth.startswith("Bearer "):
                _token_cache["token"] = auth
                _token_cache["fetched_at"] = time.time()

        def handle_response(response):
            if "ProductsSearchEngine" in response.url:
                try:
                    if "json" in response.headers.get("content-type", ""):
                        api_responses.append(response.json())
                except Exception:
                    pass

        page.on("request", handle_request)
        page.on("response", handle_response)

        try:
            page.goto(search_url, wait_until="networkidle", timeout=30000)
        except Exception:
            pass
        page.wait_for_timeout(2000)

        for resp in api_responses:
            for product in _extract_search_products(resp):
                pid = product["id"]
                if pid not in results_by_id:
                    results_by_id[pid] = product

        browser.close()

    results = list(results_by_id.values())[:max_results]

    # 가격/재고 보강 (BySkuCode API) — 병렬 호출
    if with_price:
        # 병렬 호출 전에 토큰 한번만 미리 획득
        if not _token_cache.get("token"):
            _get_bearer_token()

        ids = [p["id"] for p in results if p.get("id")]

        def _fetch_one(pid):
            return pid, fetch_product_detail(pid)

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_fetch_one, pid): pid for pid in ids}
            detail_map = {}
            for future in as_completed(futures):
                try:
                    pid, detail = future.result()
                    if not detail.get("error"):
                        detail_map[pid] = detail
                except Exception:
                    pass

        for p in results:
            detail = detail_map.get(p.get("id"))
            if detail:
                p.update({k: v for k, v in detail.items() if v is not None})

    return results


def _extract_search_products(resp) -> list:
    """검색 API 응답에서 상품 목록 추출."""
    products = []

    def walk(obj, depth=0):
        if depth > 10:
            return
        if isinstance(obj, dict):
            if "skus" in obj and isinstance(obj.get("skus"), list):
                for sku in obj["skus"]:
                    prod = _parse_search_sku(sku)
                    if prod:
                        products.append(prod)
            for v in obj.values():
                walk(v, depth + 1)
        elif isinstance(obj, list):
            for v in obj:
                walk(v, depth + 1)

    walk(resp)
    return products


def _parse_search_sku(sku: dict) -> dict | None:
    if not isinstance(sku, dict):
        return None
    sku_code = sku.get("sku_code")
    if not sku_code:
        return None

    name_en = name_th = None
    for pn in sku.get("product_names", []) or []:
        if pn.get("type") == "Online":
            dn = pn.get("display_name", {})
            name_en = dn.get("en") or name_en
            name_th = dn.get("th") or name_th

    image = None
    for img in sku.get("images", []) or []:
        if img.get("size") == "large":
            image = img.get("url")
            break

    return {
        "id": str(sku_code),
        "sku": str(sku_code),
        "name": name_th or name_en,
        "image": image,
        "url": f"https://www.ofm.co.th/product/p.{sku_code}",
    }


# ============================================================
# 테스트
# ============================================================

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("사용법: python ofm_core.py [detail|search] <입력>")
        sys.exit(1)

    mode = sys.argv[1]
    query = " ".join(sys.argv[2:])

    if mode == "detail":
        print(f"[*] 상품번호 {query} 조회...\n")
        result = fetch_product_detail(query)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif mode == "search":
        print(f"[*] '{query}' 검색 중...\n")
        results = search_products(query, max_results=10, with_price=True)
        print(f"결과: {len(results)}개\n")
        for i, p in enumerate(results, 1):
            print(f"{i:2}. [{p['id']}] {p.get('name')}")
            if p.get("price"):
                d = f" (-{p['discount_pct']}%)" if p.get("discount_pct") else ""
                o = f" (정가 ฿{p['origin_price']})" if p.get("origin_price") else ""
                print(f"     가격: ฿{p['price']}{d}{o}")
            print(f"     브랜드: {p.get('brand')} | 재고: {p.get('availability')}")
            print()
