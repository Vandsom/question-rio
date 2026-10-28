const ALLOWED_TOPICS = new Set([
    "Língua Portuguesa: Interpretação de texto, Morfologia e Sintaxe, Crase, Pontuação",
    "Informática Básica: Hardware, Windows, Word, Excel, Internet",
    "Conhecimentos Específicos: Windows 10, Office, Nuvem, Teams, Segurança da Informação",
    "Conhecimentos Específicos: LDB 9.394/96, ECA, BNCC, Educação Inclusiva, Didática Geral"
]);

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método não permitido." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("A variável de ambiente GEMINI_API_KEY não está configurada.");
        return res.status(500).json({ error: "A API ainda não está configurada no servidor." });
    }

    const { selectedTopics, quantidade } = req.body || {};
    if (
        !Array.isArray(selectedTopics) ||
        selectedTopics.length === 0 ||
        selectedTopics.some(topic => typeof topic !== "string" || !ALLOWED_TOPICS.has(topic)) ||
        new Set(selectedTopics).size !== selectedTopics.length
    ) {
        return res.status(400).json({ error: "Selecione ao menos um tópico válido." });
    }

    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 40) {
        return res.status(400).json({ error: "A quantidade deve ser um número inteiro entre 1 e 40." });
    }

    const banca = "Instituto Vicente Nelson (IVIN)";
    const prompt = `Você é um gerador de simulados de concursos públicos focado na banca ${banca}.
Sua tarefa é usar o Google Search para encontrar QUESTÕES REAIS focadas nestes temas exatos do edital: ${selectedTopics.join(", ")}.
Gere exatamente ${quantidade} questões mesclando os assuntos escolhidos.
Formato DEVE ser estritamente JSON puro:
[
  {
    "id": 1,
    "banca": "${banca} - Nome do Órgão (Ano)",
    "assunto": "Tema da Questão",
    "enunciado": "Texto completo...",
    "image": "url_opcional_ou_null",
    "opcoes": [
      {"id": "a", "texto": "Alternativa A"},
      {"id": "b", "texto": "Alternativa B"},
      {"id": "c", "texto": "Alternativa C"},
      {"id": "d", "texto": "Alternativa D"},
      {"id": "e", "texto": "Alternativa E"}
    ],
    "resposta_correta": "a",
    "justificativa": "Explicação do gabarito."
  }
]`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    tools: [{ googleSearch: {} }],
                    generationConfig: { temperature: 0.2 }
                })
            }
        );

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            console.error("O Gemini retornou uma resposta que não é JSON válido.");
            return res.status(502).json({ error: "O serviço de geração retornou uma resposta inválida." });
        }

        if (!response.ok) {
            console.error("Erro retornado pelo Gemini:", data.error?.message || response.statusText);
            return res.status(502).json({ error: data.error?.message || "Falha ao consultar o serviço de geração." });
        }

        const rawText = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        let questions;
        try {
            questions = JSON.parse(rawText);
        } catch {
            console.error("O Gemini retornou questões em formato inválido.");
            return res.status(502).json({ error: "O serviço retornou questões em formato inválido. Tente novamente." });
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(502).json({ error: "O serviço não retornou questões. Tente novamente." });
        }

        return res.status(200).json({ questions });
    } catch (error) {
        console.error("Falha ao consultar o Gemini:", error);
        return res.status(502).json({ error: "Não foi possível conectar ao serviço de geração. Tente novamente." });
    }
};

