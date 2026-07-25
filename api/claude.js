module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const systemText = body.system || "";
    const userMessages = body.messages || [];
    const lastMessage = userMessages[userMessages.length - 1];

    let parts = [];

    if (lastMessage && Array.isArray(lastMessage.content)) {
      parts = lastMessage.content.map(c => {
        if (c.type === "text") return { text: c.text };
        if (c.type === "image") {
          return {
            inlineData: {
              mimeType: c.source.media_type,
              data: c.source.data
            }
          };
        }
        return { text: "" };
      });
    } else {
      const text = typeof lastMessage?.content === "string" ? lastMessage.content : "";
      parts = [{ text }];
    }

    // Build standard Gemini payload
    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: body.max_tokens || 1500,
        temperature: 0.3
      }
    };

    // Attach system instruction properly
    if (systemText) {
      payload.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({ 
        error: "Gemini error", 
        detail: geminiData 
      });
    }

    let text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Clean markdown wrappers
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    return res.status(200).json({
      content: [{ type: "text", text }]
    });

  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
};
