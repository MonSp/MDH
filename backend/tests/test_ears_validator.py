"""
EARS验收句式校验器测试
"""

import pytest
from ears_validator import EarsValidator, validate_ears


class TestEarsValidator:
    """EarsValidator测试类"""

    def setup_method(self):
        self.validator = EarsValidator()

    # ============ 合法EARS句式测试 ============

    def test_valid_english_when_shall(self):
        """英文WHEN + SHALL格式"""
        text = "WHEN user clicks login button THEN system SHALL validate credentials"
        passed, violations = self.validator.validate(text)
        assert passed is True
        assert len(violations) == 0

    def test_valid_english_if_shall(self):
        """英文IF + SHALL格式"""
        text = "IF input is invalid THEN system SHALL display error message"
        passed, violations = self.validator.validate(text)
        assert passed is True
        assert len(violations) == 0

    def test_valid_chinese_dang_ying(self):
        """中文当 + 应格式"""
        text = "当用户点击登录按钮时，系统应验证用户名和密码"
        passed, violations = self.validator.validate(text)
        assert passed is True
        assert len(violations) == 0

    def test_valid_chinese_ruo_bixu(self):
        """中文若 + 必须格式"""
        text = "若检测到异常，系统必须触发告警"
        passed, violations = self.validator.validate(text)
        assert passed is True
        assert len(violations) == 0

    def test_valid_chinese_ruguo_dangying(self):
        """中文如果 + 应当格式"""
        text = "如果用户未登录，系统应当重定向到登录页"
        passed, violations = self.validator.validate(text)
        assert passed is True
        assert len(violations) == 0

    def test_valid_mixed_case(self):
        """混合大小写英文"""
        text = "When input is empty, the system shall show placeholder text"
        passed, violations = self.validator.validate(text)
        assert passed is True
        assert len(violations) == 0

    # ============ 缺少触发条件测试 ============

    def test_missing_trigger_english(self):
        """缺少触发条件 - 英文"""
        text = "system SHALL validate credentials"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "missing_trigger" for v in violations)

    def test_missing_trigger_chinese(self):
        """缺少触发条件 - 中文"""
        text = "系统应验证用户名和密码"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "missing_trigger" for v in violations)

    # ============ 缺少响应词测试 ============

    def test_missing_response_english(self):
        """缺少响应词 - 英文"""
        text = "WHEN user clicks login THEN validate credentials"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "missing_response" for v in violations)

    def test_missing_response_chinese(self):
        """缺少响应词 - 中文"""
        text = "当用户点击登录时，验证用户名和密码"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "missing_response" for v in violations)

    # ============ 顺序错误测试 ============

    def test_wrong_order_english(self):
        """顺序错误 - 英文"""
        text = "SHALL validate WHEN user clicks"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "wrong_order" for v in violations)

    def test_wrong_order_chinese(self):
        """顺序错误 - 中文"""
        text = "应验证当用户点击时"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "wrong_order" for v in violations)

    # ============ 模糊词测试 ============

    def test_vague_word_yinggai(self):
        """模糊词 - 应该"""
        text = "WHEN user clicks login THEN system SHOULD validate credentials"
        passed, violations = self.validator.validate(text)
        # 注意：SHOULD不是SHALL，会被识别为模糊词
        assert passed is False
        assert any(v.rule == "vague_word" for v in violations)

    def test_vague_word_keneng(self):
        """模糊词 - 可能"""
        text = "当用户提交时，系统可能需要验证"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "vague_word" for v in violations)

    def test_vague_word_jinliang(self):
        """模糊词 - 尽量"""
        text = "若输入无效，系统SHALL尽量修复"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "vague_word" for v in violations)

    def test_vague_word_yexu(self):
        """模糊词 - 也许"""
        text = "WHEN error occurs THEN system SHALL maybe retry"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "vague_word" for v in violations)

    def test_vague_word_dagai(self):
        """模糊词 - 大概"""
        text = "当超时时，系统应大概等待30秒"
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert any(v.rule == "vague_word" for v in violations)

    # ============ 边界情况测试 ============

    def test_empty_text(self):
        """空文本"""
        passed, violations = self.validator.validate("")
        assert passed is False
        assert any(v.rule == "empty_text" for v in violations)

    def test_none_text(self):
        """None文本"""
        passed, violations = self.validator.validate(None)
        assert passed is False
        assert any(v.rule == "empty_text" for v in violations)

    def test_whitespace_only(self):
        """纯空白文本"""
        passed, violations = self.validator.validate("   \n\t  ")
        assert passed is False
        assert any(v.rule == "empty_text" for v in violations)

    # ============ 复杂场景测试 ============

    def test_multiple_violations(self):
        """多个违规"""
        text = "系统应该验证"  # 缺少触发条件 + 模糊词
        passed, violations = self.validator.validate(text)
        assert passed is False
        assert len(violations) >= 2

    def test_complex_valid_ears(self):
        """复杂但合法的EARS"""
        text = "WHEN user submits the registration form AND all required fields are filled THEN system SHALL create new account and send verification email"
        passed, violations = self.validator.validate(text)
        assert passed is True

    def test_complex_valid_chinese(self):
        """复杂但合法的中文EARS"""
        text = "当用户提交注册表单且所有必填字段已填写时，系统应创建新账户并发送验证邮件"
        passed, violations = self.validator.validate(text)
        assert passed is True


class TestValidateEarsFunction:
    """validate_ears便捷函数测试"""

    def test_valid_ears(self):
        """合法EARS"""
        text = "WHEN user clicks login THEN system SHALL validate"
        passed, messages = validate_ears(text)
        assert passed is True
        assert len(messages) == 0

    def test_invalid_ears(self):
        """非法EARS"""
        text = "系统应验证"
        passed, messages = validate_ears(text)
        assert passed is False
        assert len(messages) > 0
        assert all(isinstance(m, str) for m in messages)


class TestBatchValidation:
    """批量校验测试"""

    def test_batch_mixed(self):
        """混合批量校验"""
        validator = EarsValidator()
        texts = [
            "WHEN user clicks THEN system SHALL validate",
            "系统应验证",  # 缺少触发条件
            "当用户提交时系统应验证",
        ]
        results = validator.validate_batch(texts)
        assert len(results) == 3
        assert results[0][0] is True   # 第一个通过
        assert results[1][0] is False  # 第二个失败
        assert results[2][0] is True   # 第三个通过


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
