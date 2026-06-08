"""
EARS (Event-Driven Acceptance Requirements Specification) 验收句式校验器

校验验收标准文本是否符合EARS句式：
1. 必须包含触发条件词（WHEN/IF/当/若）
2. 必须包含响应词（SHALL/应/必须）
3. 触发条件在响应之前
4. 不允许模糊词（应该/可能/尽量/也许/大概）
"""

import re
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class EarsViolation:
    """EARS校验违规项"""
    rule: str
    message: str
    position: int = -1


class EarsValidator:
    """EARS验收句式校验器"""
    
    # 触发条件词（支持中英文混合，优先匹配更长的词）
    TRIGGER_WORDS = [
        r'\bWHEN\b',      # WHEN (英文大写)
        r'\bWhen\b',      # When (英文首字母大写)
        r'\bwhen\b',      # when (英文小写)
        r'\bIF\b',        # IF (英文大写)
        r'\bIf\b',        # If (英文首字母大写)
        r'\bif\b',        # if (英文小写)
        r'如果',          # 如果 (中文，优先于"当")
        r'若',            # 若 (中文)
        r'(?<!如)当(?=时|用户|系统|检测|输入|输出|请求|响应|提交|点击|加载|保存|删除|创建|更新|发生|出现|满足|不满足|有效|无效)',  # 当 (中文，避免误匹配"应当")
    ]
    
    # 响应词（支持中英文混合）
    RESPONSE_WORDS = [
        r'\bSHALL\b',     # SHALL (英文大写)
        r'\bShall\b',     # Shall (英文首字母大写)
        r'\bshall\b',     # shall (英文小写)
        r'应',            # 应 (中文)
        r'必须',          # 必须 (中文)
        r'应当',          # 应当 (中文)
    ]
    
    # 模糊词（不允许出现）
    VAGUE_WORDS = [
        r'应该',          # 应该 (中文)
        r'可能',          # 可能 (中文)
        r'尽量',          # 尽量 (中文)
        r'也许',          # 也许 (中文)
        r'大概',          # 大概 (中文)
        r'或许',          # 或许 (中文)
        r'争取',          # 争取 (中文)
        r'尝试',          # 尝试 (中文)
        r'\bshould\b',    # should (英文)
        r'\bmight\b',     # might (英文)
        r'\bmay\b',       # may (英文)
        r'\bcould\b',     # could (英文)
        r'\bmaybe\b',     # maybe (英文)
    ]
    
    def validate(self, text: str) -> Tuple[bool, List[EarsViolation]]:
        """
        校验文本是否符合EARS句式
        
        Args:
            text: 待校验的验收标准文本
            
        Returns:
            Tuple[bool, List[EarsViolation]]: (是否通过, 违规项列表)
        """
        if not text or not text.strip():
            return False, [EarsViolation(
                rule="empty_text",
                message="验收标准文本不能为空"
            )]
        
        violations = []
        
        # 规则1: 必须包含触发条件词
        trigger_found = False
        trigger_position = -1
        for pattern in self.TRIGGER_WORDS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                trigger_found = True
                trigger_position = match.start()
                break
        
        if not trigger_found:
            violations.append(EarsViolation(
                rule="missing_trigger",
                message="验收标准必须包含触发条件词（WHEN/IF/当/若/如果）"
            ))
        
        # 规则2: 必须包含响应词
        response_found = False
        response_position = -1
        for pattern in self.RESPONSE_WORDS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                response_found = True
                response_position = match.start()
                break
        
        if not response_found:
            violations.append(EarsViolation(
                rule="missing_response",
                message="验收标准必须包含响应词（SHALL/应/必须/应当）"
            ))
        
        # 规则3: 触发条件在响应之前
        if trigger_found and response_found and trigger_position >= response_position:
            violations.append(EarsViolation(
                rule="wrong_order",
                message="触发条件（WHEN/IF/当/若）必须在响应词（SHALL/应/必须）之前",
                position=trigger_position
            ))
        
        # 规则4: 不允许模糊词
        for pattern in self.VAGUE_WORDS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                violations.append(EarsViolation(
                    rule="vague_word",
                    message=f"不允许使用模糊词 '{match.group()}'，验收标准必须是可验证的",
                    position=match.start()
                ))
        
        passed = len(violations) == 0
        return passed, violations
    
    def validate_batch(self, texts: List[str]) -> List[Tuple[bool, List[EarsViolation]]]:
        """
        批量校验多个验收标准文本
        
        Args:
            texts: 待校验的文本列表
            
        Returns:
            List[Tuple[bool, List[EarsViolation]]]: 校验结果列表
        """
        return [self.validate(text) for text in texts]


# 便捷函数
def validate_ears(text: str) -> Tuple[bool, List[str]]:
    """
    便捷函数：校验EARS句式，返回简化结果
    
    Args:
        text: 待校验的验收标准文本
        
    Returns:
        Tuple[bool, List[str]]: (是否通过, 违规消息列表)
    """
    validator = EarsValidator()
    passed, violations = validator.validate(text)
    messages = [v.message for v in violations]
    return passed, messages


if __name__ == "__main__":
    # 测试用例
    test_cases = [
        # 合法EARS
        ("WHEN 用户点击登录按钮 THEN 系统 SHALL 验证用户名和密码", True),
        ("IF 输入无效 THEN 系统 SHALL 显示错误消息", True),
        ("当用户提交表单时，系统应验证必填字段", True),
        ("若检测到异常，系统必须触发告警", True),
        
        # 缺少触发条件
        ("系统应验证用户名和密码", False),
        ("SHALL 验证输入", False),
        
        # 缺少响应词
        ("WHEN 用户点击登录按钮 THEN 验证用户名和密码", False),
        ("当用户提交表单时，验证必填字段", False),
        
        # 顺序错误
        ("SHALL 验证输入 WHEN 用户提交", False),
        ("应验证 当用户提交时", False),
        
        # 模糊词
        ("WHEN 用户点击登录按钮 THEN 系统应该验证用户名", False),
        ("当用户提交时，系统可能需要验证", False),
        ("IF 输入无效 THEN 系统 SHALL 尝试修复", False),
    ]
    
    validator = EarsValidator()
    print("EARS验收句式校验器测试")
    print("=" * 60)
    
    passed_count = 0
    total_count = len(test_cases)
    
    for text, expected in test_cases:
        passed, violations = validator.validate(text)
        status = "✓" if passed == expected else "✗"
        
        if passed == expected:
            passed_count += 1
        
        print(f"\n{status} 测试: {text[:50]}...")
        print(f"  预期: {'通过' if expected else '失败'}")
        print(f"  实际: {'通过' if passed else '失败'}")
        
        if violations:
            for v in violations:
                print(f"  违规: [{v.rule}] {v.message}")
    
    print("\n" + "=" * 60)
    print(f"测试结果: {passed_count}/{total_count} 通过")
