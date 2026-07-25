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

    const systemText = body.system || "You are an expert resume parser. Extract structured details from the provided resume into valid JSON matching the exact schema requested.";
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
      systemInstruction: {
        parts: [{ text: systemText + "\nIMPORTANT: Do NOT use unescaped double quotes or literal raw line breaks inside string values. Use clean single string text for bullet points." }]
      },
      generationConfig: {
        maxOutputTokens: body.max_tokens || 4000,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            personal: {
              type: "OBJECT",
              properties: {
                firstName: { type: "STRING" },
                lastName: { type: "STRING" },
                email: { type: "STRING" },
                phone: { type: "STRING" },
                city: { type: "STRING" },
                state: { type: "STRING" },
                country: { type: "STRING" },
                linkedin: { type: "STRING" },
                github: { type: "STRING" },
                portfolio: { type: "STRING" }
              }
            },
            summary: { type: "STRING" },
            education: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  college: { type: "STRING" },
                  degree: { type: "STRING" },
                  spec: { type: "STRING" },
                  cgpa: { type: "STRING" },
                  from: { type: "STRING" },
                  to: { type: "STRING" },
                  desc: { type: "STRING" }
                }
              }
            },
            experience: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  company: { type: "STRING" },
                  title: { type: "STRING" },
                  type: { type: "STRING" },
                  location: { type: "STRING" },
                  from: { type: "STRING" },
                  to: { type: "STRING" },
                  current: { type: "BOOLEAN" },
                  resp: { type: "STRING" }
                }
              }
            },
            projects: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  desc: { type: "STRING" },
                  tech: { type: "STRING" },
                  github: { type: "STRING" },
                  live: { type: "STRING" }
                }
              }
            },
            skills: {
              type: "OBJECT",
              properties: {
                technical: { type: "ARRAY", items: { type: "STRING" } },
                soft: { type: "ARRAY", items: { type: "STRING" } },
                languages: { type: "ARRAY", items: { type: "STRING" } },
                certifications: { type: "ARRAY", items: { type: "STRING" } }
              }
            },
            achievements: {
              type: "OBJECT",
              properties: {
                awards: { type: "STRING" },
                hackathons: { type: "STRING" },
                publications: { type: "STRING" },
                patents: { type: "STRING" }
              }
            }
          }
        }
      }
    };

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

    // Cleanup formatting
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    return res.status(200).json({
      content: [{ type: "text", text }]
    });

  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
};
