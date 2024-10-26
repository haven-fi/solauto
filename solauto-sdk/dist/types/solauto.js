"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorityFeeSettingValues = exports.PriorityFeeSetting = void 0;
var PriorityFeeSetting;
(function (PriorityFeeSetting) {
    PriorityFeeSetting["None"] = "None";
    PriorityFeeSetting["Min"] = "Min";
    PriorityFeeSetting["Low"] = "Low";
    PriorityFeeSetting["Default"] = "Medium";
    PriorityFeeSetting["High"] = "High";
})(PriorityFeeSetting || (exports.PriorityFeeSetting = PriorityFeeSetting = {}));
exports.priorityFeeSettingValues = Object.values(PriorityFeeSetting);
