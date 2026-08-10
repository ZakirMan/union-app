import json

transcript_path = "/Users/zakir/.gemini/antigravity/brain/640b12e1-1b0a-4282-b83a-c0ce43c18305/.system_generated/logs/transcript_full.jsonl"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        step = json.loads(line)
        if step.get('type') == 'USER_INPUT':
            content = step.get('content', '')
            print("Length of content:", len(content))
            print("Start of content:", repr(content[:500]))
            break
