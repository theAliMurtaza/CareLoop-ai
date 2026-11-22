import re

POINTERS = {"en": "Discuss your results with your doctor.", "ur": "اپنے نتائج پر ڈاکٹر سے بات کریں۔"}
REQUEST_PATTERNS = [r"\b(?:diagnos\w*|prescrib\w*|prescrip\w*|dosage|dose|cure|treatment|medication|medicine|insulin|metformin)\b", r"\b(?:do|could|might) i have\b", r"\b(?:diabetes|cancer|kidney failure|heart attack)\b", r"\b(?:start|stop|increase|decrease|double|halve|change|take)\b.*\b(?:pill|drug|tablet|mg|medicin|medicat)\w*", r"ignore.*(?:instruction|rule|previous)", r"system prompt|developer message|pretend.*doctor", r"تشخیص|نسخہ|خوراک|دوا|دوائی|انسولین|کینسر|ذیابیطس|شوگر.*ہے"]
OUTPUT_PATTERNS = [r"\byou (?:have|definitely have|suffer from)\b", r"\b(?:diagnosed|prescribe|prescription|dosage|take \d|start taking|stop taking|increase.*dose|decrease.*dose)\b", r"\b(?:fatal|terrifying|panic|you will die|certain death)\b", r"آپ کو .*ہے|دوا .*لیں|خوراک .*بڑھا|جان لیوا|یقینی موت"]


def blocked_request(text: str) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL) for pattern in REQUEST_PATTERNS)


def blocked_output(text: str) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL) for pattern in OUTPUT_PATTERNS)


def refusal(locale: str) -> str:
    if locale == "ur":
        return "میں تشخیص، نسخہ یا دوا کی خوراک میں تبدیلی نہیں بتا سکتا۔ میں صرف رپورٹ میں درج نتائج اور فراہم کردہ ذرائع کی وضاحت کر سکتا ہوں۔ " + POINTERS["ur"]
    return "I can explain recorded results and provided sources, but I cannot diagnose, prescribe, or recommend medication or dosage changes. " + POINTERS["en"]
