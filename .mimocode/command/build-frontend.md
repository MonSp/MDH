---
description: Build frontend and check for errors
---

Run the frontend build and report the result:

```bash
cd /home/test/MDH && npm run build 2>&1 | tail -10
```

If the build fails, report the first error. If it succeeds, report "Build OK" and the output file size.
