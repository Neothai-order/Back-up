"""
DBD DataWarehouse 재무 요약 스크래퍼 (Tier 1)

대상:
    https://datawarehouse.dbd.go.th/company/profile/5/{juristic_id}

추출:
    - 회사 기본 정보 (이미 openapi.dbd.go.th에서 가져오니 참고용)
    - 연도별 재무 요약 (총매출, 순이익, 자산, 부채, 자본)

방식:
    Playwright로 페이지 로드 → 재무 섹션 대기 → DOM에서 값 파싱
"""

import re
import time
from playwright.sync_api import sync_playwright

PROFILE_URL = "https://datawarehouse.dbd.go.th/company/profile/5/{id}"
FINANCIAL_URL = "https://datawarehouse.dbd.go.th/company/profile/5/{id}/3"  # 재무제표 탭

TIMEOUT_MS = 30000  # 30초 (DBD는 느림)


def _parse_number(text: str):
    """ '1,234,567.89' → 1234567.89, 빈 값은 None """
    if text is None:
        return None
    s = str(text).strip().replace(",", "").replace(" ", "")
    if not s or s in ("-", "N/A", "—"):
        return None
    try:
        return float(s)
    except Exception:
        return None


def fetch_financial_summary(juristic_id: str, headless: bool = True, debug: bool = False):
    """
    DBD DataWarehouse 재무 요약 조회

    Returns:
        {
            "ok": bool,
            "id": str,
            "nameTh": str,
            "nameEn": str,
            "years": [
                {
                    "year": "2566",  # 불기 연도 (서기 - 543)
                    "totalRevenue": float | None,
                    "netProfit": float | None,
                    "totalAssets": float | None,
                    "totalLiabilities": float | None,
                    "shareholdersEquity": float | None,
                },
                ...
            ],
            "error": str | None,
            "screenshotPath": str | None  # debug=True 시
        }
    """
    result = {
        "ok": False,
        "id": juristic_id,
        "nameTh": "",
        "nameEn": "",
        "years": [],
        "error": None,
        "screenshotPath": None,
    }

    if not re.match(r"^\d{13}$", juristic_id):
        result["error"] = "13자리 법인번호가 아닙니다"
        return result

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            context = browser.new_context(
                locale="th-TH",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
            )
            page = context.new_page()

            url = PROFILE_URL.format(id=juristic_id)
            if debug:
                print(f"[DBD] Going to {url}")
            page.goto(url, timeout=TIMEOUT_MS, wait_until="networkidle")
            time.sleep(2)

            if debug:
                print(f"[DBD] After initial load - title: {page.title()}")

            # Nuxt SPA 렌더링 완료 대기 (body 내용이 실제로 채워질 때까지)
            try:
                page.wait_for_function(
                    "document.body && document.body.innerText.length > 500",
                    timeout=20000,
                )
            except Exception as e:
                if debug:
                    print(f"[DBD] Body fill timeout: {e}")

            time.sleep(2)

            # 회사명 추출 (h1 또는 제목 영역)
            try:
                name_text = page.evaluate("""
                    () => {
                        const sel = ['h1', 'h2', '[class*=CompanyName]', '[class*=company-name]', '[class*=profile]'];
                        for (const s of sel) {
                            const el = document.querySelector(s);
                            if (el && el.innerText && el.innerText.trim().length > 3) {
                                return el.innerText.trim();
                            }
                        }
                        return '';
                    }
                """)
                result["nameTh"] = name_text or ""
                if debug:
                    print(f"[DBD] Name: {name_text}")
            except Exception as e:
                if debug:
                    print(f"[DBD] Name extract failed: {e}")

            # 재무제표 탭으로 이동
            fin_url = FINANCIAL_URL.format(id=juristic_id)
            if debug:
                print(f"[DBD] Going to financial tab: {fin_url}")
            try:
                page.goto(fin_url, timeout=TIMEOUT_MS, wait_until="networkidle")
                time.sleep(3)  # SPA 렌더링 대기
                # Wait for financial content
                try:
                    page.wait_for_function(
                        "document.body && /รายได้|สินทรัพย์|กำไร|ขาดทุน|financial|revenue/i.test(document.body.innerText)",
                        timeout=15000,
                    )
                except Exception:
                    if debug:
                        print("[DBD] Financial keywords wait timed out")
            except Exception as e:
                result["error"] = f"재무 탭 로드 실패: {e}"
                if debug:
                    import os
                    tmpdir = os.environ.get("TEMP", ".")
                    result["screenshotPath"] = os.path.join(tmpdir, f"dbd_err_{juristic_id}.png")
                    page.screenshot(path=result["screenshotPath"], full_page=True)
                browser.close()
                return result

            # 테이블에서 숫자 추출 시도
            # DBD는 재무 요약을 테이블 또는 카드로 표시
            data = page.evaluate("""
                () => {
                    // 가능한 선택자들 시도
                    const rows = [];
                    // 테이블 기반
                    const tables = document.querySelectorAll('table');
                    tables.forEach(t => {
                        const ths = Array.from(t.querySelectorAll('th')).map(x => x.innerText.trim());
                        const trs = Array.from(t.querySelectorAll('tbody tr'));
                        trs.forEach(tr => {
                            const tds = Array.from(tr.querySelectorAll('td')).map(x => x.innerText.trim());
                            if (tds.length > 1) rows.push({ headers: ths, cells: tds });
                        });
                    });
                    // 페이지 전체 텍스트도 반환 (패턴 기반 파싱용)
                    return {
                        title: document.title,
                        bodyText: document.body ? document.body.innerText : '',
                        tables: rows,
                    };
                }
            """)

            if debug:
                import os
                tmpdir = os.environ.get("TEMP", ".")
                result["_debug"] = {
                    "title": data.get("title"),
                    "bodyTextSnippet": (data.get("bodyText") or "")[:3000],
                    "tableCount": len(data.get("tables") or []),
                    "tables": (data.get("tables") or [])[:5],
                }
                screenshot_path = os.path.join(tmpdir, f"dbd_{juristic_id}.png")
                page.screenshot(path=screenshot_path, full_page=True)
                result["screenshotPath"] = screenshot_path

            # 패턴 기반 파싱: "รายได้รวม ... 1,234,567"
            body_text = data.get("bodyText") or ""
            years_data = _parse_financial_text(body_text)
            result["years"] = years_data
            result["ok"] = bool(years_data)

            browser.close()

    except Exception as e:
        result["error"] = str(e)

    return result


def _parse_financial_text(text: str):
    """
    본문 텍스트에서 연도별 재무 요약 추출.
    DBD DataWarehouse의 재무 요약 패턴:
        ปี 2566
        รายได้รวม       12,345,678.90
        กำไร(ขาดทุน)สุทธิ  123,456.78
        สินทรัพย์รวม    98,765,432.10
        หนี้สินรวม      45,678,901.23
        ส่วนของผู้ถือหุ้น 53,086,530.87
    """
    years = []
    # 연도 블록 분리 (ปี 2566, 2565, ...)
    blocks = re.split(r"ปี\s+(25\d{2})", text)
    # blocks = [prefix, year1, content1, year2, content2, ...]
    for i in range(1, len(blocks) - 1, 2):
        year = blocks[i]
        content = blocks[i + 1]

        def find(label_regex):
            m = re.search(label_regex + r"\s+([\d,\.\-]+)", content)
            return _parse_number(m.group(1)) if m else None

        entry = {
            "year": year,
            "totalRevenue": find(r"รายได้รวม"),
            "netProfit": find(r"กำไร.*?สุทธิ|ขาดทุน.*?สุทธิ"),
            "totalAssets": find(r"สินทรัพย์รวม"),
            "totalLiabilities": find(r"หนี้สินรวม"),
            "shareholdersEquity": find(r"ส่วนของผู้ถือหุ้น|ส่วนของเจ้าของ"),
        }
        # 적어도 하나 이상 숫자가 있어야 유효
        if any(v is not None for v in [entry["totalRevenue"], entry["netProfit"], entry["totalAssets"]]):
            years.append(entry)

    return years


if __name__ == "__main__":
    import sys
    import json
    jid = sys.argv[1] if len(sys.argv) > 1 else "0105548114921"
    debug = "--debug" in sys.argv
    headful = "--headful" in sys.argv
    r = fetch_financial_summary(jid, headless=not headful, debug=debug)
    print(json.dumps(r, ensure_ascii=False, indent=2))
