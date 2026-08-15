from employee_directory import Employee, EmployeeDirectory, get_directory


def test_directory_resolves_employee():
    d = EmployeeDirectory([Employee(employee_id="e1", name="张三", email="zhang@x.com")])
    emp = d.resolve("e1")
    assert emp is not None and emp.name == "张三" and emp.email == "zhang@x.com"


def test_display_name_known_and_fallback():
    d = EmployeeDirectory([Employee(employee_id="e1", name="张三")])
    assert d.display_name("e1") == "张三"
    assert d.display_name("unknown-id") == "unknown-id"  # 未命中原样回退


def test_default_directory_contains_demo_employees():
    d = get_directory()
    names = {e.employee_id: e.name for e in d.all()}
    assert names["emp-001"] == "张伟"  # 内置演示员工
    assert d.display_name("emp-002") != "emp-002"  # 解析成功


def test_default_directory_falls_back_gracefully():
    assert get_directory().display_name("ghost") == "ghost"
