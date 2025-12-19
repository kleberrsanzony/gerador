export const config = {
    runtime: "edge",
};

/**
 * Rate limit simples (memória do edge) — protege sua API key de abuso.
 * Obs: em edge/serverless, isso pode reiniciar às vezes, mas já ajuda muito.
 */
const RATE = new Map();
const WINDOW_MS = 60_000; // 1 min
const MAX_REQ = 12; // por IP por janela

function rateLimit(ip) {
    const now = Date.now();
    const rec = RATE.get(ip) || { start: now, count: 0 };

    if (now - rec.start > WINDOW_MS) {
        rec.start = now;
        rec.count = 0;
    }

    rec.count += 1;
    RATE.set(ip, rec);

    return rec.count <= MAX_REQ;
}

function json(status, obj) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            "Content-Type": "application/json",
            // (opcional) CORS básico se você consumir de outro domínio
            "Access-Control-Allow-Origin": "*",
        },
    });
}

export default async function handler(request) {
    // Preflight CORS
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
        });
    }

    if (request.method !== "POST") {
        return json(405, { error: "Method not allowed. Use POST." });
    }

    try {
        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

        if (!rateLimit(ip)) {
            return json(429, { error: "Muitas requisições. Aguarde 1 minuto e tente novamente." });
        }

        const body = await request.json().catch(() => ({}));
        const prompt = body?.prompt;

        if (!prompt || typeof prompt !== "string") {
            return json(400, { error: "Prompt is required (string)." });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY;


        if (!apiKey) {
            return json(500, { error: "Server configuration error: API Key missing." });
        }

        /**
         * ✅ Para gerar TEXTO, use modelo de TEXTO.
         * Se você usar gemini-2.5-flash-image, pode vir imagem/parts sem texto e dar “No text returned”.
         *
         * Você pode controlar via ENV na Vercel:
         *   GEMINI_MODEL=gemini-2.0-flash
         * ou deixar o default abaixo.
         */
        const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.85,
                // maxOutputTokens: 1200, // se quiser travar tamanho
            },
        };

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                },
                body: JSON.stringify(payload),
            }
        );

        if (!resp.ok) {
            const errText = await resp.text();
            return json(500, { error: `API Error: ${resp.status} - ${errText}` });
        }

        const data = await resp.json();

        // ✅ Junta todos os textos retornados (mais robusto que pegar só parts[0])
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts.map((p) => p?.text).filter(Boolean).join("\n").trim();

        if (!text) {
            return json(500, {
                error:
                    "No text returned from API. Dica: use um modelo de TEXTO (ex: gemini-2.0-flash).",
            });
        }

        return json(200, { text });
    } catch (e) {
        return json(500, { error: e?.message || String(e) });
    }
}
