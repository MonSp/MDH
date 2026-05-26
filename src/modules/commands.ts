export const cmdNames: Record<string, string> = {
  navigate:'导航', search:'搜索', click_button:'点击元素', fill_field:'填写字段',
  login:'登录', scroll:'滚动', wait:'等待', get_screenshot:'截图', get_tabs:'获取标签页',
  switch_tab:'切换标签页', create_tab:'新建标签页', close_tab:'关闭标签页',
  press_key:'按键', evaluate_js:'执行脚本', execute_plan:'执行计划'
}

export function getFriendlyName(cmd: string): string { return cmdNames[cmd] || cmd }
