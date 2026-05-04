import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


URL_RE = re.compile(r"https?://[^\s)>\]\"']+", re.IGNORECASE)
DEFAULT_INPUT = Path("data/inbox_text.txt")
DEFAULT_OUTPUT = Path("data/places_inbox.json")


def clean_url(url):
    return url.strip().rstrip(".,;")


def normalize_block(block):
    return "\n".join(line.strip() for line in block.splitlines() if line.strip())


def split_blocks(text):
    chunks = re.split(r"\n\s*\n+", text.strip())
    return [normalize_block(chunk) for chunk in chunks if normalize_block(chunk)]


def guess_category(text):
    lower = text.lower()
    checks = [
        ("рестораны и кафе", ["кафе", "кофе", "ресторан", "бар", "завтрак", "ужин", "еда"]),
        ("музеи и выставки", ["музей", "выстав", "галере", "павильон", "экспози"]),
        ("парки и прогулки", ["парк", "сад", "прогул", "набереж", "трамвайчик"]),
        ("спорт и активность", ["йога", "спорт", "батут", "падел", "фитнес", "клуб"]),
        ("мастер-классы", ["мастер", "студия", "рисован", "шить", "гончар", "керамик"]),
        ("пространства", ["пространство", "лофт", "холл", "ателье"]),
        ("спа и красота", ["спа", "массаж", "салон", "уход"]),
        ("события", ["событие", "концерт", "игра", "лото", "фестиваль"]),
    ]
    for category, words in checks:
        if any(word in lower for word in words):
            return category
    return "не разобрано"


def guess_source(urls):
    joined = " ".join(urls).lower()
    if "instagram.com" in joined:
        return "instagram"
    if "t.me" in joined or "telegram" in joined:
        return "telegram"
    if urls:
        return "link"
    return "text"


def title_from_block(block, urls):
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    non_url_lines = [line for line in lines if not URL_RE.search(line)]
    if non_url_lines:
        candidate = non_url_lines[0]
        candidate = re.sub(r"^(маша|masha|я|me)\s*:\s*", "", candidate, flags=re.IGNORECASE)
        return candidate[:90]
    if urls:
        parsed = re.sub(r"^https?://", "", urls[0], flags=re.IGNORECASE)
        return parsed.split("?")[0][:90]
    return "Новое место"


def make_id(block):
    digest = hashlib.sha1(block.encode("utf-8")).hexdigest()[:12]
    return f"inbox-{digest}"


def parse_inbox(text):
    now = datetime.now(timezone.utc).isoformat()
    drafts = []
    for block in split_blocks(text):
        urls = [clean_url(url) for url in URL_RE.findall(block)]
        draft = {
            "id": make_id(block),
            "status": "new",
            "source": guess_source(urls),
            "title": title_from_block(block, urls),
            "raw_text": block,
            "urls": sorted(set(urls)),
            "category_guess": guess_category(block),
            "notes": "",
            "created_at": now,
        }
        drafts.append(draft)
    return drafts


def load_existing(path):
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save_drafts(path, drafts):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(drafts, ensure_ascii=False, indent=2), encoding="utf-8")


def merge_drafts(existing, incoming):
    by_id = {item["id"]: item for item in existing}
    added = 0
    for item in incoming:
        if item["id"] not in by_id:
            by_id[item["id"]] = item
            added += 1
    return list(by_id.values()), added


def main():
    parser = argparse.ArgumentParser(description="Parse pasted Instagram/Telegram notes into inbox drafts.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Text file with pasted messages.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="JSON file for inbox drafts.")
    parser.add_argument("--replace", action="store_true", help="Replace existing inbox instead of merging.")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    incoming = parse_inbox(input_path.read_text(encoding="utf-8"))
    if args.replace:
        save_drafts(output_path, incoming)
        print(f"Saved {len(incoming)} drafts to {output_path}")
        return

    existing = load_existing(output_path)
    merged, added = merge_drafts(existing, incoming)
    save_drafts(output_path, merged)
    print(f"Added {added} new drafts. Total: {len(merged)}. Output: {output_path}")


if __name__ == "__main__":
    main()
