Development notes

- This prototype expects a local LLM HTTP server exposing a `/v1/chat` endpoint that accepts `{prompt}` and returns `{reply}`.
- For prototyping you can run Ollama, llama.cpp based servers, or mock the endpoint.

Example curl to test LLM adapter (mock):

```bash
curl -X POST http://localhost:11434/v1/chat -H "Content-Type: application/json" -d '{"prompt":"Hello"}'
```
