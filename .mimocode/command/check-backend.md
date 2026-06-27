---
description: Check Python backend syntax
---

Run a syntax check on the backend Python files:

```bash
python3 -c "import ast; ast.parse(open('backend/server.py', encoding='utf-8').read()); print('server.py OK')"
```

Working directory: `/home/test/MDH`

If there's a syntax error, report the line number and error. If it passes, report "Syntax OK".
