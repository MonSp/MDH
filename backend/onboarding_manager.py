import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class OnboardingState:
    completed: bool = False
    current_step: int = 0  # 0=not_started, 1=api_key, 2=model_select, 3-5=tasks, 6=completed
    api_key_configured: bool = False
    model_selected: str = ""
    tasks_completed: int = 0
    started_at: str = ""
    completed_at: str = ""


class OnboardingManager:
    def __init__(self, data_dir: str):
        self._path = os.path.join(data_dir, "onboarding_state.json")
        self._state = self._load()

    def _load(self) -> OnboardingState:
        try:
            if os.path.exists(self._path):
                with open(self._path) as f:
                    data = json.load(f)
                return OnboardingState(**data)
        except Exception:
            pass
        return OnboardingState()

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self._path), exist_ok=True)
            tmp = self._path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(asdict(self._state), f, indent=2, ensure_ascii=False)
            os.replace(tmp, self._path)
        except Exception:
            pass

    def get_state(self) -> dict:
        return asdict(self._state)

    def update_step(self, step: int):
        if self._state.current_step < step:
            self._state.current_step = step
        if step == 1 and not self._state.started_at:
            self._state.started_at = datetime.now(timezone.utc).isoformat()
        self._save()

    def mark_api_key_configured(self):
        self._state.api_key_configured = True
        self.update_step(2)

    def mark_model_selected(self, model: str):
        self._state.model_selected = model
        self.update_step(3)

    def mark_task_completed(self, task_index: int):
        self._state.tasks_completed = max(self._state.tasks_completed, task_index + 1)
        self.update_step(4 + task_index)

    def complete(self):
        self._state.completed = True
        self._state.completed_at = datetime.now(timezone.utc).isoformat()
        self._state.current_step = 6
        self._save()

    def reset(self):
        self._state = OnboardingState()
        self._save()
