---
description: Validate roles_config.yaml structure
---

Validate the roles_config.yaml file:

```bash
& "C:\Users\qgh13\miniconda3\envs\browser-agent\python.exe" -c "import yaml; data = yaml.safe_load(open('backend/roles_config.yaml', 'r', encoding='utf-8')); print('Skills:', len(data.get('skills', {}))); print('Base roles:', len(data.get('base_roles', {}))); print('Custom roles:', len(data.get('custom_roles', {}))); print('YAML OK')"
```

If there's a YAML parsing error, report the error. If it passes, report the counts and "YAML OK".
