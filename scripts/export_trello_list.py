import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


API_ROOT = "https://api.trello.com/1"
URL_RE = re.compile(r"https?://[^\s)>\]\"']+", re.IGNORECASE)
ENV_FILE = Path(".env")


def load_dotenv(path):
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(name, value)


def env_required(name):
    value = os.environ.get(name)
    if not value:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def trello_get(path, params):
    query = urllib.parse.urlencode(params, doseq=True)
    url = f"{API_ROOT}{path}?{query}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def board_short_link(board_ref):
    match = re.search(r"trello\.com/b/([^/\s]+)", board_ref)
    return match.group(1) if match else None


def find_board(boards, board_ref):
    normalized = board_ref.strip().lower()
    short_link = board_short_link(board_ref)

    for board in boards:
        candidates = {
            board.get("id", ""),
            board.get("name", ""),
            board.get("shortLink", ""),
            board.get("url", ""),
            board.get("shortUrl", ""),
        }
        if short_link:
            candidates.add(short_link)

        if any(str(candidate).strip().lower() == normalized for candidate in candidates):
            return board
        if short_link and board.get("shortLink") == short_link:
            return board

    return None


def find_list(lists, list_name):
    normalized = list_name.strip().lower()
    for item in lists:
        if item.get("name", "").strip().lower() == normalized:
            return item
    return None


def extract_urls(text):
    if not text:
        return []
    return sorted(set(match.rstrip(".,;") for match in URL_RE.findall(text)))


def simplify_card(card):
    attachments = card.get("attachments") or []
    checklists = card.get("checklists") or []
    desc = card.get("desc") or ""

    return {
        "id": card.get("id"),
        "name": card.get("name"),
        "description": desc,
        "trello_url": card.get("url") or card.get("shortUrl"),
        "labels": [label.get("name") or label.get("color") for label in card.get("labels", [])],
        "urls_in_description": extract_urls(desc),
        "attachments": [
            {
                "name": attachment.get("name"),
                "url": attachment.get("url"),
                "mimeType": attachment.get("mimeType"),
            }
            for attachment in attachments
        ],
        "checklists": [
            {
                "name": checklist.get("name"),
                "items": [
                    {
                        "name": item.get("name"),
                        "state": item.get("state"),
                    }
                    for item in checklist.get("checkItems", [])
                ],
            }
            for checklist in checklists
        ],
        "date_last_activity": card.get("dateLastActivity"),
    }


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path, cards):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "name",
                "description",
                "trello_url",
                "labels",
                "urls_in_description",
                "attachments",
                "checklists",
                "date_last_activity",
            ],
        )
        writer.writeheader()
        for card in cards:
            writer.writerow(
                {
                    "name": card["name"],
                    "description": card["description"],
                    "trello_url": card["trello_url"],
                    "labels": ", ".join(card["labels"]),
                    "urls_in_description": "\n".join(card["urls_in_description"]),
                    "attachments": "\n".join(
                        attachment["url"] or "" for attachment in card["attachments"]
                    ),
                    "checklists": json.dumps(card["checklists"], ensure_ascii=False),
                    "date_last_activity": card["date_last_activity"],
                }
            )


def main():
    load_dotenv(ENV_FILE)

    key = env_required("TRELLO_KEY")
    token = env_required("TRELLO_TOKEN")
    board_ref = env_required("TRELLO_BOARD")
    list_name = env_required("TRELLO_LIST")

    auth = {"key": key, "token": token}

    print("Loading boards...")
    boards = trello_get(
        "/members/me/boards",
        {
            **auth,
            "fields": "id,name,url,shortUrl,shortLink,closed",
            "filter": "open",
        },
    )

    board = find_board(boards, board_ref)
    if not board:
        available = "\n".join(f"- {item['name']} ({item['shortUrl']})" for item in boards)
        print(f"Board not found. Available boards:\n{available}", file=sys.stderr)
        sys.exit(1)

    print(f"Board: {board['name']}")
    lists = trello_get(
        f"/boards/{board['id']}/lists",
        {
            **auth,
            "fields": "id,name,closed,pos",
            "filter": "open",
        },
    )

    trello_list = find_list(lists, list_name)
    if not trello_list:
        available = "\n".join(f"- {item['name']}" for item in lists)
        print(f"List not found. Available lists:\n{available}", file=sys.stderr)
        sys.exit(1)

    print(f"List: {trello_list['name']}")
    cards = trello_get(
        f"/lists/{trello_list['id']}/cards",
        {
            **auth,
            "fields": "id,name,desc,url,shortUrl,labels,dateLastActivity,pos",
            "attachments": "true",
            "attachment_fields": "name,url,mimeType",
            "checklists": "all",
            "checkItem_fields": "name,state",
        },
    )

    simplified_cards = [simplify_card(card) for card in cards]
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "exported_at": timestamp,
        "board": {"id": board["id"], "name": board["name"], "url": board["url"]},
        "list": {"id": trello_list["id"], "name": trello_list["name"]},
        "cards": simplified_cards,
    }

    output_dir = Path("data")
    write_json(output_dir / "trello_places_raw.json", payload)
    write_csv(output_dir / "trello_places.csv", simplified_cards)

    print(f"Exported {len(simplified_cards)} cards.")
    print(f"JSON: {output_dir / 'trello_places_raw.json'}")
    print(f"CSV: {output_dir / 'trello_places.csv'}")


if __name__ == "__main__":
    main()
