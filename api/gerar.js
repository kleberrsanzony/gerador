export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Use POST" });
    }

    try {
        const { prompt } = req.body || {};
        if (!prompt) return res.status(400).json({ error: "prompt ausente" });

        const r = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4.1-mini",
                input: prompt,
            }),
        });

        if (!r.ok) {
            const t = await r.text();
            return res.status(r.status).send(t);
        }

        const data = await r.json();
        return res.status(200).json({ text: (data.output_text || "").trim() });
    } catch (e) {
        return res.status(500).json({ error: e?.message || String(e) });
    }
}
