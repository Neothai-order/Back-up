"""
Makro PRO 스크래퍼 코어 모듈 (v2.2 - 검색+배치 GraphQL 병합)

핵심 변경:
- 검색 API는 빠르지만 재고/이미지 누락 케이스 있음
- 검색 후 GraphQL 배치 호출로 모든 상품 상세 한번에 조회
- 두 응답 병합 → 정확한 데이터

검색 API와 GraphQL API가 서로 다른 필드 이름 사용:
- 검색: images, originalPrice, inventoryQuantity, makroId
- GraphQL: imageUrls, originPrice, totalInventory
"""

import json
import requests


SEARCH_URL = "https://search.maknet.siammakro.cloud/search/api/v1/indexes/products/search"
GRAPHQL_URL = "https://marketplace.mango-prod.siammakro.cloud/product/api/v1/graphql?apiVersion=20230109"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
    "Content-Type": "application/json",
    "Origin": "https://www.makro.pro",
    "Referer": "https://www.makro.pro/",
}

DEFAULT_STORE_CODES = [
    "01", "3P_2048", "3P_2859", "3P_2869", "3P_3061", "3P_4224",
    "3P_6286", "3P_6283", "3P_6374", "3P_3077", "3P_2696", "3P_2898",
    "3P_2107", "3P_2138", "3P_2442", "3P_2685", "3P_2966", "3P_2994",
    "3P_2981", "3P_3003", "3P_2949", "3P_3071", "3P_4157", "3P_4155",
    "3P_4173", "3P_3001", "3P_2084", "3P_2134", "3P_2142", "3P_2872",
    "3P_2888", "3P_2135", "3P_2194", "3P_2593", "3P_2240", "3P_2884",
    "3P_2983", "3P_4082", "3P_4158", "3P_4154", "3P_4179", "3P_4223",
    "3P_4220", "3P_4153", "3P_4165",
]

GRAPHQL_QUERY = """
query products(
  $ids: [String!]!,
  $storeCodes: [String!],
  $lang: String,
  $countryCode: String,
  $allowAlcohol: Boolean,
  $isSalesCustomer: Boolean,
  $is3P: Boolean,
  $isSameDayAllowedForStore: Boolean,
  $isExpressDeliveryStore: Boolean
) {
  products(
    ids: $ids
    storeCodes: $storeCodes
    lang: $lang
    countryCode: $countryCode
    allowAlcohol: $allowAlcohol
    isSalesCustomer: $isSalesCustomer
    is3P: $is3P
    isSameDayAllowedForStore: $isSameDayAllowedForStore
    isExpressDeliveryStore: $isExpressDeliveryStore
  ) {
    id title brand brandEn description size
    displayPrice originPrice priceUnit
    imageUrls sku skuCode status
    totalInventory moq
    discountStartDate discountEndDate
  }
}
""".strip()


# ============================================================
# 메인 진입점
# ============================================================

def search_products(keyword: str, max_results: int = 20, enrich: bool = True) -> list:
    """
    Makro PRO 상품 검색.
    enrich=True 이면 GraphQL로 재고/이미지/설명 보강 (권장).
    """
    # Step 1: 검색 API 호출
    search_results = _search_only(keyword, max_results)
    if not search_results or (search_results and search_results[0].get("error")):
        return search_results

    if not enrich:
        return search_results

    # Step 2: 모든 internal_id를 한 번에 GraphQL로 배치 조회
    ids = [r["internal_id"] for r in search_results if r.get("internal_id")]
    if not ids:
        return search_results

    graphql_data = _graphql_batch(ids)

    # Step 3: 병합 (GraphQL 데이터가 더 정확하므로 우선)
    for result in search_results:
        gid = result.get("internal_id")
        if gid and gid in graphql_data:
            g = graphql_data[gid]
            # GraphQL의 값으로 덮어쓰기 (단, 비어있지 않은 경우만)
            if g.get("image"):
                result["image"] = g["image"]
            if g.get("inventory") is not None:
                result["inventory"] = g["inventory"]
                result["availability"] = "재고있음" if g["inventory"] > 0 else "품절"
            if g.get("description"):
                result["description"] = g["description"]
            if g.get("size") and not result.get("size"):
                result["size"] = g["size"]

    return search_results


def fetch_product_detail(product_id: str) -> dict:
    """단일 상품 조회. 짧은 SKU든 긴 ID든 처리."""
    pid = str(product_id).strip()

    # 긴 숫자 ID는 GraphQL 직접
    if pid.isdigit() and len(pid) >= 10:
        data = _graphql_batch([pid])
        if pid in data:
            return data[pid]
        # 실패 시 검색 폴백

    # 짧은 SKU: 검색으로 찾고 GraphQL로 보강
    results = search_products(pid, max_results=10, enrich=True)
    if not results or results[0].get("error"):
        err = results[0].get("error") if results else "검색 결과 없음"
        return {"id": pid, "error": err}

    # 정확 매칭 우선
    for r in results:
        if (r.get("makro_id") == pid or r.get("id") == pid
                or r.get("internal_id") == pid):
            return r
    return results[0]


# ============================================================
# 내부 헬퍼
# ============================================================

def _search_only(keyword: str, max_results: int = 20) -> list:
    """검색 API만 호출 (빠름, 재고/이미지는 부정확할 수 있음)."""
    payload = {
        "q": keyword,
        "size": max_results,
        "filters": {"storeCodes": DEFAULT_STORE_CODES},
    }
    try:
        r = requests.post(SEARCH_URL, json=payload, headers=HEADERS, timeout=20)
        r.raise_for_status()
        data = r.json()
    except requests.HTTPError as e:
        return [{"error": f"Makro 검색 API 오류: HTTP {e.response.status_code}"}]
    except Exception as e:
        return [{"error": f"Makro 검색 실패: {e}"}]

    hits = data.get("hits", [])
    return [_parse_search_hit(h.get("document", {})) for h in hits]


def _parse_search_hit(doc: dict) -> dict:
    """검색 API hit 파싱."""
    images = doc.get("images", []) or []
    first_image = images[0] if images else None

    display_price = doc.get("displayPrice")
    origin_price = doc.get("originalPrice")
    discount_pct = None
    if display_price is not None and origin_price is not None and origin_price > display_price:
        discount_pct = round((origin_price - display_price) / origin_price * 100)

    # 검색 API의 inventoryQuantity는 특정 매장 기준이므로 GraphQL로 보강 필요
    inv = doc.get("inventoryQuantity", 0) or 0

    long_id = str(doc.get("id") or doc.get("productId") or "")
    makro_id = str(doc.get("makroId") or "")

    name = doc.get("titleEn") or doc.get("title")

    return {
        "id": makro_id or long_id,
        "internal_id": long_id,
        "makro_id": makro_id,
        "sku": doc.get("sku", ""),
        "name": name,
        "name_th": doc.get("title"),
        "brand": doc.get("brandEn") or doc.get("brand"),
        "size": doc.get("unitSize"),
        "price": str(display_price) if display_price is not None else None,
        "origin_price": str(origin_price) if origin_price is not None else None,
        "discount_pct": discount_pct,
        "currency": doc.get("priceUnit", "THB"),
        "image": first_image,
        "availability": "재고있음" if inv > 0 else "품절",
        "inventory": int(inv),
        "url": f"https://www.makro.pro/en/p/{long_id}" if long_id else None,
        "description": None,
        "seller": doc.get("seller"),
    }


def _graphql_batch(ids: list) -> dict:
    """
    여러 internal_id를 한 번에 조회 (배치).
    반환: { internal_id: 상품dict, ... }
    """
    if not ids:
        return {}

    payload = {
        "operationName": "products",
        "query": GRAPHQL_QUERY,
        "variables": {
            "ids": [str(i) for i in ids],
            "storeCodes": DEFAULT_STORE_CODES,
            "lang": "en",
            "countryCode": "TH",
            "allowAlcohol": True,
            "isSalesCustomer": False,
            "is3P": False,
            "isSameDayAllowedForStore": True,
            "isExpressDeliveryStore": False,
        },
    }
    try:
        r = requests.post(GRAPHQL_URL, json=payload, headers=HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"[!] GraphQL 배치 실패: {e}")
        return {}

    if "errors" in data:
        print(f"[!] GraphQL 에러: {data['errors']}")
        return {}

    products = data.get("data", {}).get("products", []) or []
    result = {}
    for p in products:
        if not p:
            continue
        pid = str(p.get("id", ""))
        if not pid:
            continue
        result[pid] = _parse_graphql_product(p, pid)
    return result


def _parse_graphql_product(p: dict, pid: str) -> dict:
    """GraphQL 응답 상품 파싱."""
    img_urls = p.get("imageUrls") or []
    inv = p.get("totalInventory") or 0
    display_price = p.get("displayPrice")
    origin_price = p.get("originPrice")
    discount_pct = None
    if display_price is not None and origin_price is not None and origin_price > display_price:
        discount_pct = round((origin_price - display_price) / origin_price * 100)

    sku = str(p.get("sku", ""))

    return {
        "id": sku or pid,
        "internal_id": pid,
        "makro_id": sku if sku.isdigit() else "",
        "sku": sku,
        "name": p.get("title"),
        "brand": p.get("brandEn") or p.get("brand"),
        "size": p.get("size"),
        "price": str(display_price) if display_price is not None else None,
        "origin_price": str(origin_price) if origin_price is not None else None,
        "discount_pct": discount_pct,
        "currency": p.get("priceUnit", "THB"),
        "image": img_urls[0] if img_urls else None,
        "inventory": int(inv),
        "availability": "재고있음" if inv > 0 else "품절",
        "url": f"https://www.makro.pro/en/p/{pid}",
        "description": p.get("description"),
    }


# ============================================================
# 테스트
# ============================================================

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("사용법: python makro_core.py [search|detail] <입력>")
        sys.exit(1)

    mode = sys.argv[1]
    query = " ".join(sys.argv[2:])

    if mode == "search":
        print(f"[*] '{query}' 검색+보강 중...\n")
        results = search_products(query, max_results=10)
        if results and results[0].get("error"):
            print(f"[!] {results[0]['error']}")
        else:
            print(f"검색 결과: {len(results)}개\n")
            for i, p in enumerate(results, 1):
                print(f"{i:2}. [{p['id']}] {p.get('name')}")
                if p.get("price"):
                    d = f" (-{p['discount_pct']}%)" if p.get("discount_pct") else ""
                    o = f" (정가 ฿{p['origin_price']})" if p.get("origin_price") and p.get("origin_price") != p.get("price") else ""
                    print(f"     가격: ฿{p['price']}{d}{o}")
                print(f"     브랜드: {p.get('brand')} | 재고: {p.get('inventory')}개 ({p.get('availability')})")
                if p.get("image"):
                    print(f"     이미지: ✓")
                else:
                    print(f"     이미지: (없음)")
                print()
    elif mode == "detail":
        print(f"[*] 상품번호 {query} 조회 중...\n")
        result = fetch_product_detail(query)
        print(json.dumps(result, indent=2, ensure_ascii=False))
