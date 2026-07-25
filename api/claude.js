module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY environment variable is not set in Vercel" });

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
              mimeType: c.source?.media_type || "image/jpeg",
              data: c.source?.data || ""
            }
          };
        }
        return { text: "" };
      });
    } else if (lastMessage) {
      const text = typeof lastMessage.content === "string" 
        ? lastMessage.content 
        : JSON.stringify(lastMessage.content || "");
      parts = [{ text }];
    } else {
      parts = [{ text: "Parse resume content" }];
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: body.max_tokens || 2000,
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    if (systemText && systemText.trim() !== "") {
      payload.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const detailedMessage = geminiData?.error?.message || JSON.stringify(geminiData);
      console.error("Gemini API Error Detail:", geminiData);
      return res.status(geminiRes.status).json({ 
        error: `Gemini API Error: ${detailedMessage}`
      });
    }

    let text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Clean markdown code blocks if returned
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    return res.status(200).json({
      content: [{ type: "text", text }]
    });

  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
};
