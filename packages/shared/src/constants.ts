export const APP_NAME = "CodeMentor AI";

export const ROLES = ["STUDENT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const LANGUAGES = ["C", "CPP", "JAVA", "PYTHON", "JAVASCRIPT"] as const;
export type Language = (typeof LANGUAGES)[number];
