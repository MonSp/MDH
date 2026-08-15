"""员工目录：employee_id → 员工信息（显示名/邮箱/职位）解析。

设计文档 [S1] 员工身份的落地点：把关人/提交者从占位字符串解析为真实员工。
未命中回退原 ID（前端 truthy 回落链 approverName || approver || '系统' 的衔接）。
目录可注入（试点部门真实目录）或使用内置默认演示目录（占位数据）。
"""

from dataclasses import dataclass


@dataclass
class Employee:
    employee_id: str = ""
    name: str = ""
    email: str = ""
    position: str = ""


# 内置默认演示目录（试点占位：行政/市场/研发各一名）
_DEFAULT_EMPLOYEES = [
    Employee("emp-001", "张伟", "zhangwei@example.com", "行政专员"),
    Employee("emp-002", "李娜", "lina@example.com", "市场专员"),
    Employee("emp-003", "王强", "wangqiang@example.com", "研发工程师"),
]


class EmployeeDirectory:
    def __init__(self, employees: list[Employee] | None = None):
        self._by_id = {e.employee_id: e for e in (employees if employees is not None else _DEFAULT_EMPLOYEES)}

    def resolve(self, employee_id: str) -> Employee | None:
        return self._by_id.get(employee_id)

    def display_name(self, employee_id: str) -> str:
        emp = self._by_id.get(employee_id)
        return emp.name if emp else employee_id

    def all(self) -> list[Employee]:
        return list(self._by_id.values())


_default_directory: EmployeeDirectory | None = None


def get_directory() -> EmployeeDirectory:
    global _default_directory
    if _default_directory is None:
        _default_directory = EmployeeDirectory()
    return _default_directory
