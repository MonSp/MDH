"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRoleTemplates = loadRoleTemplates;
exports.getTemplate = getTemplate;
exports.getAvailableRoles = getAvailableRoles;
exports.getPromptTemplate = getPromptTemplate;
exports.formatPrompt = formatPrompt;
var fs_1 = require("fs");
var path_1 = require("path");
// 兼容 ESM 和 CJS 环境
// __dirname 在 CJS 环境中全局可用
// 在 ESM 环境中需要从 import.meta.url 推导，但 Electron 打包后使用 CJS
var _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
var _config = null;
var _templates = null;
function loadConfig() {
    if (_config)
        return _config;
    // Electron 打包后 __dirname 指向 dist-electron，需要向上两级到项目根目录
    var jsonPath = (0, path_1.resolve)(_dirname, '../../orchestrator/templates/roles.json');
    try {
        _config = JSON.parse((0, fs_1.readFileSync)(jsonPath, 'utf-8'));
    }
    catch (_a) {
        // 回退：尝试原始路径（开发环境）
        var fallbackPath = (0, path_1.resolve)(_dirname, '../../templates/roles.json');
        _config = JSON.parse((0, fs_1.readFileSync)(fallbackPath, 'utf-8'));
    }
    return _config;
}
function loadRoleTemplates() {
    if (_templates)
        return _templates;
    var config = loadConfig();
    _templates = new Map();
    for (var _i = 0, _a = Object.entries(config.base_roles); _i < _a.length; _i++) {
        var _b = _a[_i], id = _b[0], role = _b[1];
        var promptTemplate = config.prompt_templates[role.prompt_template || ''];
        var prompt_1 = promptTemplate
            ? promptTemplate.replace(/\{name\}/g, '{member_name}')
            : '你是{member_name}，{member_description}';
        _templates.set(id, __assign(__assign({}, role), { custom_prompt: prompt_1 }));
    }
    for (var _c = 0, _d = Object.entries(config.custom_roles); _c < _d.length; _c++) {
        var _e = _d[_c], id = _e[0], role = _e[1];
        var baseRole = role.base_role ? config.base_roles[role.base_role] : undefined;
        var baseTools = new Set((baseRole === null || baseRole === void 0 ? void 0 : baseRole.tools) || []);
        var mergedTools = __spreadArray(__spreadArray([], baseTools, true), (role.tools || []), true);
        var prompt_2 = role.custom_prompt || '';
        if (!prompt_2 && baseRole) {
            var baseTemplate = config.prompt_templates[baseRole.prompt_template || ''];
            prompt_2 = baseTemplate || '';
        }
        prompt_2 = prompt_2.replace(/\{name\}/g, '{member_name}');
        if (!prompt_2)
            prompt_2 = '你是{member_name}，{member_description}';
        _templates.set(id, {
            name: role.name,
            description: role.description,
            team_role: role.team_role || (baseRole === null || baseRole === void 0 ? void 0 : baseRole.team_role) || 'Executor',
            tools: mergedTools,
            dangerous_tools: role.dangerous_tools || (baseRole === null || baseRole === void 0 ? void 0 : baseRole.dangerous_tools) || [],
            skills: __spreadArray([], new Set(__spreadArray(__spreadArray([], ((baseRole === null || baseRole === void 0 ? void 0 : baseRole.skills) || []), true), (role.skills || []), true)), true),
            custom_prompt: prompt_2,
        });
    }
    return _templates;
}
function getTemplate(roleId) {
    return loadRoleTemplates().get(roleId);
}
function getAvailableRoles() {
    return Array.from(loadRoleTemplates().keys());
}
function getPromptTemplate(key) {
    var config = loadConfig();
    return config.prompt_templates[key];
}
function formatPrompt(template, vars) {
    var prompt = template.custom_prompt || '你是{member_name}，{member_description}';
    prompt = prompt.replace(/\{member_name\}/g, vars.name);
    prompt = prompt.replace(/\{member_description\}/g, vars.description);
    prompt = prompt.replace(/\{team_name\}/g, vars.team_name || '');
    prompt = prompt.replace(/\{team_description\}/g, vars.team_description || '');
    prompt = prompt.replace(/\{leader_name\}/g, vars.leader_name || '');
    return prompt;
}
