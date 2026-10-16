/**
 * quick-chat.ts — the Comms quick-chat catalog (shared so the game-contract
 * test checks the exact list the UI ships).
 */

// All quickchat items from the game, organized by category. Must match the
// game's resources/QuickChat.json exactly — an unknown key throws in the
// game's binary encoder (game-contract tests pin this list to the file).
export const QC_NEEDS_TARGET = new Set([
  "help.help_defend", "help.send_troops_to", "help.send_gold_to",
  "attack.attack", "attack.mirv", "attack.focus", "attack.finish", "attack.betray",
  "defend.defend", "defend.defend_from", "defend.dont_attack", "defend.ally", "defend.make_ally",
  "misc.team_up",
  "warnings.strong", "warnings.weak", "warnings.mirv_soon",
  "warnings.has_allies", "warnings.no_allies",
  "warnings.betrayed", "warnings.betrayed_me",
  "warnings.getting_big", "warnings.danger_base",
  "warnings.saving_for_mirv", "warnings.mirv_ready",
  "warnings.snowballing", "warnings.cheating", "warnings.stop_trading",
  "warnings.disconnected", "warnings.pirating",
]);

export interface QCCategory {
  title: string;
  prefix: string;
  keys: string[];
}

export const QC_CATEGORIES: QCCategory[] = [
  {
    title: "Greetings",
    prefix: "greet",
    keys: [
      "hello", "good_job", "good_luck", "have_fun", "gg",
      "nice_to_meet", "well_played", "hi_again", "bye", "thanks",
      "oops", "trust_me", "trust_broken", "ruining_games", "dont_do_that", "same_team",
    ],
  },
  {
    title: "Help",
    prefix: "help",
    keys: [
      "troops", "troops_frontlines", "gold", "no_attack",
      "sorry_attack", "alliance", "help_defend", "trade_partners",
      "send_troops_to", "send_gold_to",
    ],
  },
  {
    title: "Attack",
    prefix: "attack",
    keys: ["attack", "mirv", "focus", "finish", "build_warships", "betray", "build_sams", "crown"],
  },
  {
    title: "Defend",
    prefix: "defend",
    keys: ["defend", "defend_from", "dont_attack", "ally", "build_posts", "make_ally"],
  },
  {
    title: "Misc",
    prefix: "misc",
    keys: ["go", "strategy", "fun", "team_up", "pr", "build_closer", "coastline", "join_discord"],
  },
  {
    title: "Warnings",
    prefix: "warnings",
    keys: [
      "strong", "weak", "mirv_soon", "stalemate",
      "has_allies", "no_allies", "betrayed", "betrayed_me",
      "getting_big", "danger_base", "saving_for_mirv", "mirv_ready",
      "snowballing", "cheating", "stop_trading", "stop_trading_enemies",
      "disconnected", "pirating",
    ],
  },
];
