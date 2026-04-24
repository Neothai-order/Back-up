"""
Neo Sales App - Code Separation Script
Splits index.html into: style.css, lang.js, customer.js, order.js,
delivery.js, extra.js, account.js, attendance.js, tracking.js, chat.js
"""
import os

BASE = r'C:\Users\pang8\OneDrive\Desktop\앱 개발'
INPUT = os.path.join(BASE, 'index.html')
V = '133'

with open(INPUT, 'r', encoding='utf-8') as f:
    lines = f.readlines()

total_orig = len(lines)
print(f"Original index.html: {total_orig} lines")

def get_lines(start, end):
    """Get lines from start to end (1-indexed, inclusive)"""
    return lines[start-1:end]

# ========== 1. CSS EXTRACTION ==========
print("\n[1/3] Extracting CSS...")

css_parts = []
css_parts.append("/* Neo Sales App - Combined Styles (auto-separated) */\n\n")
css_parts.append("/* ══ Main Styles ══ */\n")
css_parts.extend(get_lines(33, 4988))  # Between <style>(32) and </style>(4989)
css_parts.append("\n/* ══ MyTracking Styles ══ */\n")
css_parts.extend(get_lines(30797, 30806))  # Between <style>(30796) and </style>(30807)
css_parts.append("\n/* ══ Attendance & Delivery Address Styles ══ */\n")
css_parts.extend(get_lines(31554, 31603))  # Between <style>(31553) and </style>(31604)

with open(os.path.join(BASE, 'style.css'), 'w', encoding='utf-8') as f:
    f.writelines(css_parts)
print(f"  style.css: {len(css_parts)} lines")

# ========== 2. JS MODULE EXTRACTION ==========
print("\n[2/3] Extracting JS modules...")

# Modules from main script block (5981-28125, content 5982-28124)
# Core init stays in index.html: 5982-8873 + 27869-28124
main_modules = {
    'lang.js':     (26602, 27868, 'Translations & i18n'),
    'customer.js': (8874,  10834, 'Customer Master & Registration'),
    'order.js':    (10835, 18438, 'Orders, Quotation & Mega-menu'),
    'delivery.js': (18439, 22920, 'Shipping, Delivery & Consignment'),
    'extra.js':    (22921, 24233, 'FCM, Notifications, Announcements'),
    'account.js':  (24234, 26601, 'Account Settings & Management'),
}

# Validate: no overlapping ranges
ranges = sorted(main_modules.items(), key=lambda x: x[1][0])
for i in range(len(ranges)-1):
    name1, (_, end1, _) = ranges[i]
    name2, (start2, _, _) = ranges[i+1]
    if end1 >= start2:
        print(f"  ERROR: Overlap between {name1} (end {end1}) and {name2} (start {start2})")
        exit(1)
    print(f"  OK: {name1} ends at {end1}, {name2} starts at {start2} (gap: {start2-end1-1} lines)")

# Validate: all within main script block
for name, (start, end, desc) in main_modules.items():
    if start < 5982 or end > 28124:
        print(f"  ERROR: {name} ({start}-{end}) outside main script block (5982-28124)")
        exit(1)

for name, (start, end, desc) in main_modules.items():
    content = f"// Neo Sales App - {desc} (auto-separated)\n"
    content += ''.join(get_lines(start, end))
    with open(os.path.join(BASE, name), 'w', encoding='utf-8') as f:
        f.write(content)
    line_count = end - start + 2  # +1 for range, +1 for header
    print(f"  {name}: {line_count} lines ({desc})")

# Separate script blocks (full block replacement)
sep_modules = {
    'attendance.js': (29052, 30642, 'Mobile Menu & Attendance'),
    'tracking.js':   (30691, 30794, 'MyTracking'),
    'chat.js':       (31721, 33208, 'Real-time Chat System'),
}

for name, (start, end, desc) in sep_modules.items():
    content = f"// Neo Sales App - {desc} (auto-separated)\n"
    content += ''.join(get_lines(start, end))
    with open(os.path.join(BASE, name), 'w', encoding='utf-8') as f:
        f.write(content)
    line_count = end - start + 2
    print(f"  {name}: {line_count} lines ({desc})")

# ========== 3. REBUILD INDEX.HTML ==========
print("\n[3/3] Rebuilding index.html...")

new = []

# Lines 1-31: keep (head, meta tags)
new.extend(get_lines(1, 31))

# Replace <style> block (32-4989) with CSS link
new.append(f'<link rel="stylesheet" href="style.css?v={V}">\n')

# Lines 4990-5980: keep (external scripts, HTML)
new.extend(get_lines(4990, 5980))

# Insert module script tags before main script
new.append('\n<!-- ══ Separated JS Modules ══ -->\n')
new.append(f'<script src="lang.js?v={V}"></script>\n')
new.append(f'<script src="customer.js?v={V}"></script>\n')
new.append(f'<script src="order.js?v={V}"></script>\n')
new.append(f'<script src="delivery.js?v={V}"></script>\n')
new.append(f'<script src="extra.js?v={V}"></script>\n')
new.append(f'<script src="account.js?v={V}"></script>\n')
new.append('\n')

# Main script: core init (5982-8873) + remaining (27869-28124)
new.append('<script>\n')
new.append('// ══ Core Init ══\n')
new.extend(get_lines(5982, 8873))
new.append('\n')
new.append('// ══ Cancel / Address Modal / Map ══\n')
new.extend(get_lines(27869, 28124))
new.append('\n</script>\n')

# Lines 28126-29050: HTML (order overlay, modals, etc.)
new.extend(get_lines(28126, 29050))

# Replace attendance script block (29051-30643)
new.append(f'<script src="attendance.js?v={V}"></script>\n')

# Lines 30644-30689: HTML (mobile bottom nav, etc.)
new.extend(get_lines(30644, 30689))

# Replace tracking script block (30690-30795)
new.append(f'<script src="tracking.js?v={V}"></script>\n')

# Lines 30796-30807: skip (tracking CSS -> style.css)
# Lines 30808-31552: HTML
new.extend(get_lines(30808, 31552))

# Lines 31553-31604: skip (attendance CSS -> style.css)
# Lines 31605-31719: HTML
new.extend(get_lines(31605, 31719))

# Replace chat script block (31720-33209)
new.append(f'<script src="chat.js?v={V}"></script>\n')

# Lines 33210-33234: remaining HTML
new.extend(get_lines(33210, total_orig))

# Write
with open(INPUT, 'w', encoding='utf-8') as f:
    f.writelines(new)

total_new = len(new)
print(f"\n=== RESULT ===")
print(f"index.html: {total_orig} -> {total_new} lines (reduced by {total_orig - total_new})")

# Summary
all_files = list(main_modules.keys()) + list(sep_modules.keys()) + ['style.css']
for name in all_files:
    path = os.path.join(BASE, name)
    with open(path, 'r', encoding='utf-8') as f:
        cnt = sum(1 for _ in f)
    print(f"  {name}: {cnt} lines")
print(f"\nTotal lines in all files: {total_new + sum(sum(1 for _ in open(os.path.join(BASE, n), encoding='utf-8')) for n in all_files)}")
