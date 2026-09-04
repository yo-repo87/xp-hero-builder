# UI Chrome Asset Manifest

Extracted 755 unique sprites (of 755 total unique names matched) from the game's real Unity asset data via UnityPy, exported at native resolution to `assets/img/ui/<category>/`. Every image is the exact in-game texture — nothing here was redrawn or approximated.

**Not extracted / out of scope for this pass:** anything not matching the prefix/substring list in the extraction script (see `extract_ui_chrome.py` in the session scratchpad). If a needed chrome piece isn't here, it may still exist under a different naming convention — worth a targeted re-scan before assuming it doesn't exist.

---

## circle (11)

Per-rarity circular weapon-icon background rings (all 64x64) — drop behind a weapon icon, color-coded by rarity. This is the game's real rarity-frame system for item icons.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `circle/Circle_Stats.png` | 64x64 | Circle_Stats | 1 |
| `circle/Circle_WeaponBg_Ancient.png` | 64x64 | Circle_WeaponBg_Ancient | 1 |
| `circle/Circle_WeaponBg_Brown.png` | 64x64 | Circle_WeaponBg_Brown | 1 |
| `circle/Circle_WeaponBg_Epic.png` | 64x64 | Circle_WeaponBg_Epic | 1 |
| `circle/Circle_WeaponBg_Eternal.png` | 64x64 | Circle_WeaponBg_Eternal | 1 |
| `circle/Circle_WeaponBg_Exotic.png` | 64x64 | Circle_WeaponBg_Exotic | 1 |
| `circle/Circle_WeaponBg_Fine.png` | 64x64 | Circle_WeaponBg_Fine | 1 |
| `circle/Circle_WeaponBg_Legendary.png` | 64x64 | Circle_WeaponBg_Legendary | 1 |
| `circle/Circle_WeaponBg_Mythic.png` | 64x64 | Circle_WeaponBg_Mythic | 1 |
| `circle/Circle_WeaponBg_Normal.png` | 64x64 | Circle_WeaponBg_Normal | 1 |
| `circle/Circle_WeaponBg_Rare.png` | 64x64 | Circle_WeaponBg_Rare | 1 |

## ribbon (19)

Per-rarity ribbon/banner sprites, two families: the 252x64 flat 'Ribbon_<Rarity>' set (item-card rarity ribbon) and the 256x~134 taller 'Ribbon_<Color>' set (likely offer/pack banners, not rarity-specific — named by color not tier). Ribbon_SGrade_Select (396x78) is the special 9th-tier/'S-Grade' banner. Ribbon_Hero_Step_* are hero star/ascension progress banners.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `ribbon/Ribbon_Ancient.png` | 252x64 | Ribbon_Ancient | 1 |
| `ribbon/Ribbon_Blue.png` | 256x134 | Ribbon_Blue | 3 |
| `ribbon/Ribbon_Epic.png` | 252x64 | Ribbon_Epic | 1 |
| `ribbon/Ribbon_Eternal.png` | 252x64 | Ribbon_Eternal | 1 |
| `ribbon/Ribbon_Exotic.png` | 252x64 | Ribbon_Exotic | 1 |
| `ribbon/Ribbon_Fine.png` | 252x64 | Ribbon_Fine | 1 |
| `ribbon/Ribbon_Hero_Step_Blue.png` | 256x133 | Ribbon_Hero_Step_Blue | 1 |
| `ribbon/Ribbon_Hero_Step_Green.png` | 256x133 | Ribbon_Hero_Step_Green | 1 |
| `ribbon/Ribbon_Hero_Step_Purple.png` | 256x133 | Ribbon_Hero_Step_Purple | 1 |
| `ribbon/Ribbon_Legendary.png` | 252x64 | Ribbon_Legendary | 1 |
| `ribbon/Ribbon_Mythic.png` | 252x64 | Ribbon_Mythic | 1 |
| `ribbon/Ribbon_Nomal.png` | 252x64 | Ribbon_Nomal | 1 |
| `ribbon/Ribbon_Orange.png` | 256x134 | Ribbon_Orange | 1 |
| `ribbon/Ribbon_Pink.png` | 256x134 | Ribbon_Pink | 1 |
| `ribbon/Ribbon_Purple.png` | 256x134 | Ribbon_Purple | 2 |
| `ribbon/Ribbon_Purple_02.png` | 256x133 | Ribbon_Purple_02 | 1 |
| `ribbon/Ribbon_Rare.png` | 252x64 | Ribbon_Rare | 1 |
| `ribbon/Ribbon_Red.png` | 256x134 | Ribbon_Red | 1 |
| `ribbon/Ribbon_SGrade_Select.png` | 396x78 | Ribbon_SGrade_Select | 1 |

## grade (10)

Small (134x40) rarity-name text badges/plates, one per tier — pairs with the circle/ribbon art as the actual text label graphic instead of a rendered font, for exact in-game rarity labels.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `grade/Grade_Ancient.png` | 134x40 | Grade_Ancient | 2 |
| `grade/Grade_Epic.png` | 134x40 | Grade_Epic | 2 |
| `grade/Grade_Eternal.png` | 128x38 | Grade_Eternal | 2 |
| `grade/Grade_Exotic.png` | 134x40 | Grade_Exotic | 2 |
| `grade/Grade_Fine.png` | 134x40 | Grade_Fine | 2 |
| `grade/Grade_Legendary.png` | 134x40 | Grade_Legendary | 2 |
| `grade/Grade_Mythic.png` | 134x40 | Grade_Mythic | 2 |
| `grade/Grade_None.png` | 134x40 | Grade_None | 2 |
| `grade/Grade_Normal.png` | 134x40 | Grade_Normal | 2 |
| `grade/Grade_Rare.png` | 134x40 | Grade_Rare | 2 |

## panel (10)

Background panel textures for card/box UI. Brown-parchment family (Panel_Brown_R10, Panel_Header_Brown_R10) suggests the base menu chrome is warm brown/parchment, not the cool dark-navy theme originally used in this app. Small sizes (~64-106px) mean these are almost certainly meant to be CSS-tiled or 9-slice-stretched, not shown at native size.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `panel/Panel_Blessing_Blue_Bottom.png` | 100x138 | Panel_Blessing_Blue_Bottom | 1 |
| `panel/Panel_Blessing_Brown_Bottom.png` | 100x80 | Panel_Blessing_Brown_Bottom | 1 |
| `panel/Panel_Blessing_Red_Bottom.png` | 100x138 | Panel_Blessing_Red_Bottom | 1 |
| `panel/Panel_Blessing_Yellow_Bottom.png` | 100x138 | Panel_Blessing_Yellow_Bottom | 1 |
| `panel/Panel_Brown_R10.png` | 106x70 | Panel_Brown_R10 | 1 |
| `panel/Panel_Header_Brown_R10.png` | 106x126 | Panel_Header_Brown_R10 | 1 |
| `panel/Panel_OrangePink_R15_S128.png` | 42x138 | Panel_OrangePink_R15_S128 | 1 |
| `panel/Panel_OrangePink_R15_S256.png` | 42x266 | Panel_OrangePink_R15_S256 | 1 |
| `panel/Panel_TabBg_Gray_V01.png` | 32x32 | Panel_TabBg_Gray_V01 | 2 |
| `panel/Panel_Victory_Brown.png` | 64x104 | Panel_Victory_Brown | 1 |

## btn (99)

Buttons, mostly by color (Green/Yellow/Blue/Gray/Red) and height suffix (H60/H64/H84/H102/H128 = pixel height of a horizontally-stretchable button — treat as 9-slice/border-image sources, only the height is fixed). Btn_Close_01 = modal close button. Btn_Arrow_* = pagination/scroll arrows.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `btn/Btn_7Days_Arrow.png` | 220x180 | Btn_7Days_Arrow | 1 |
| `btn/Btn_Ability_Brown.png` | 32x120 | Btn_Ability_Brown | 1 |
| `btn/Btn_Arrow.png` | 44x61 | Btn_Arrow | 2 |
| `btn/Btn_Arrow_Yellow_H72.png` | 64x72 | Btn_Arrow Yellow_H72 | 1 |
| `btn/Btn_Arrow_Cream.png` | 38x50 | Btn_Arrow_Cream | 1 |
| `btn/Btn_Arrow_Main_White.png` | 40x24 | Btn_Arrow_Main_White | 1 |
| `btn/Btn_Back.png` | 78x80 | Btn_Back | 1 |
| `btn/Btn_Back_02.png` | 64x64 | Btn_Back_02 | 1 |
| `btn/Btn_Base_Orange.png` | 52x90 | Btn_Base_Orange | 1 |
| `btn/Btn_BlueGray_H128.png` | 114x128 | Btn_BlueGray_H128 | 1 |
| `btn/Btn_Blue_H62.png` | 38x65 | Btn_Blue_H62 | 1 |
| `btn/Btn_Blue_H64.png` | 64x64 | Btn_Blue_H64 | 1 |
| `btn/Btn_Blue_H80.png` | 50x80 | Btn_Blue_H80 | 1 |
| `btn/Btn_Blue_R12.png` | 64x64 | Btn_Blue_R12 | 1 |
| `btn/Btn_BossRaid_Expert.png` | 40x71 | Btn_BossRaid_Expert | 1 |
| `btn/Btn_BossRaid_Hard.png` | 40x71 | Btn_BossRaid_Hard | 1 |
| `btn/Btn_BossRaid_Hell.png` | 40x71 | Btn_BossRaid_Hell | 1 |
| `btn/Btn_BossRaid_Normal.png` | 40x71 | Btn_BossRaid_Normal | 1 |
| `btn/Btn_BossRaid_Unlock.png` | 40x71 | Btn_BossRaid_Unlock | 1 |
| `btn/Btn_Brown_H62.png` | 38x64 | Btn_Brown_H62 | 1 |
| `btn/Btn_Brown_OFF.png` | 64x67 | Btn_Brown_OFF | 1 |
| `btn/Btn_Brown_On.png` | 64x64 | Btn_Brown_On | 1 |
| `btn/Btn_Close.png` | 70x74 | Btn_Close | 8 |
| `btn/Btn_Close_01.png` | 72x76 | Btn_Close_01 | 1 |
| `btn/Btn_Close_02.png` | 72x76 | Btn_Close_02 | 1 |
| `btn/Btn_Close_2.png` | 76x76 | Btn_Close_2 | 1 |
| `btn/Btn_Down.png` | 60x44 | Btn_Down | 1 |
| `btn/Btn_Down_02.png` | 41x33 | Btn_Down_02 | 1 |
| `btn/Btn_Enter_Red.png` | 150x110 | Btn_Enter_Red | 1 |
| `btn/Btn_Enter_Yellow.png` | 146x112 | Btn_Enter_Yellow | 1 |
| `btn/Btn_Gray.png` | 72x72 | Btn_Gray | 1 |
| `btn/Btn_Gray_H102.png` | 56x102 | Btn_Gray_H102 | 2 |
| `btn/Btn_Gray_H128.png` | 48x128 | Btn_Gray_H128 | 1 |
| `btn/Btn_Gray_H62.png` | 38x64 | Btn_Gray_H62 | 2 |
| `btn/Btn_Gray_H70.png` | 64x70 | Btn_Gray_H70 | 1 |
| `btn/Btn_Gray_H84.png` | 38x87 | Btn_Gray_H84 | 1 |
| `btn/Btn_Green.png` | 64x64 | Btn_Green | 3 |
| `btn/Btn_Green_H102.png` | 56x102 | Btn_Green_H102 | 6 |
| `btn/Btn_Green_H114.png` | 56x114 | Btn_Green_H114 | 1 |
| `btn/Btn_Green_H128.png` | 114x128 | Btn_Green_H128 | 2 |
| `btn/Btn_Green_H128_V02.png` | 48x128 | Btn_Green_H128_V02 | 1 |
| `btn/Btn_Green_H60.png` | 46x60 | Btn_Green_H60 | 1 |
| `btn/Btn_Green_H62.png` | 38x65 | Btn_Green_H62 | 2 |
| `btn/Btn_Green_H70.png` | 64x70 | Btn_Green_H70 | 1 |
| `btn/Btn_Green_H84.png` | 38x87 | Btn_Green_H84 | 1 |
| `btn/Btn_Info.png` | 38x38 | Btn_Info | 1 |
| `btn/Btn_Invasion_Pass_Active.png` | 62x64 | Btn_Invasion_Pass_Active | 1 |
| `btn/Btn_Invasion_Pass_Inactive.png` | 42x62 | Btn_Invasion_Pass_Inactive | 1 |
| `btn/Btn_Invasion_Pass_Vip.png` | 72x112 | Btn_Invasion_Pass_Vip | 1 |
| `btn/Btn_LGray_H128.png` | 114x128 | Btn_LGray_H128 | 1 |
| `btn/Btn_LGray_H64.png` | 68x68 | Btn_LGray_H64 | 1 |
| `btn/Btn_LevelPass_Vip.png` | 72x108 | Btn_LevelPass_Vip | 1 |
| `btn/Btn_LevelPass_Vip_02.png` | 72x108 | Btn_LevelPass_Vip_02 | 1 |
| `btn/Btn_LevelPass_Vip_03.png` | 72x108 | Btn_LevelPass_Vip_03 | 2 |
| `btn/Btn_LevelPass_top.png` | 56x62 | Btn_LevelPass_top | 1 |
| `btn/Btn_LevelPass_top_2.png` | 56x62 | Btn_LevelPass_top_2 | 1 |
| `btn/Btn_Main.png` | 76x70 | Btn_Main | 1 |
| `btn/Btn_MainLobby_1Plus2Offer.png` | 127x106 | Btn_MainLobby_1Plus2Offer | 1 |
| `btn/Btn_MainLobby_MultiOffer.png` | 127x96 | Btn_MainLobby_MultiOffer | 1 |
| `btn/Btn_Main_Brown.png` | 74x74 | Btn_Main_Brown | 1 |
| `btn/Btn_Main_Hamburger_Brown.png` | 64x64 | Btn_Main_Hamburger_Brown | 1 |
| `btn/Btn_Option_Beige.png` | 46x76 | Btn_Option_Beige | 1 |
| `btn/Btn_Option_Brown.png` | 46x76 | Btn_Option_Brown | 1 |
| `btn/Btn_Orange_H60.png` | 34x64 | Btn_Orange_H60 | 1 |
| `btn/Btn_Outline_Gray_R14.png` | 32x32 | Btn_Outline_Gray_R14 | 1 |
| `btn/Btn_Public_Blue.png` | 64x64 | Btn_Public_Blue | 1 |
| `btn/Btn_Quest_Yellow_01.png` | 76x96 | Btn_Quest_Yellow_01 | 1 |
| `btn/Btn_Red.png` | 64x64 | Btn_Red | 1 |
| `btn/Btn_Red_H102.png` | 56x102 | Btn_Red_H102 | 2 |
| `btn/Btn_Return_On.png` | 74x74 | Btn_Return_On | 1 |
| `btn/Btn_S_Weapon_GrowthPass.png` | 99x78 | Btn_S_Weapon_GrowthPass | 1 |
| `btn/Btn_Shop_Off_Gray.png` | 64x64 | Btn_Shop_Off_Gray | 1 |
| `btn/Btn_Shop_On_Yellow.png` | 128x94 | Btn_Shop_On_Yellow | 1 |
| `btn/Btn_Sky_R12.png` | 64x64 | Btn_Sky_R12 | 1 |
| `btn/Btn_Smithy_Off.png` | 70x76 | Btn_Smithy_Off | 1 |
| `btn/Btn_Synergy_Green.png` | 54x66 | Btn_Synergy_Green | 1 |
| `btn/Btn_Tab_Off_05.png` | 64x64 | Btn_Tab_Off_05 | 1 |
| `btn/Btn_Tab_On_05.png` | 64x110 | Btn_Tab_On_05 | 1 |
| `btn/Btn_Tap_Off_FivePack.png` | 40x58 | Btn_Tap_Off_FivePack | 1 |
| `btn/Btn_Tap_On_FivePack.png` | 40x60 | Btn_Tap_On_FivePack | 1 |
| `btn/Btn_Tier_Select.png` | 161x126 | Btn_Tier_Select | 1 |
| `btn/Btn_Traits_Gray.png` | 86x115 | Btn_Traits_Gray | 1 |
| `btn/Btn_Traits_Green.png` | 86x116 | Btn_Traits_Green | 1 |
| `btn/Btn_Traits_Green_Auto.png` | 86x116 | Btn_Traits_Green_Auto | 1 |
| `btn/Btn_Traits_Orange.png` | 86x115 | Btn_Traits_Orange | 1 |
| `btn/Btn_Traits_Red.png` | 86x115 | Btn_Traits_Red | 1 |
| `btn/Btn_UpDown.png` | 60x44 | Btn_UpDown | 1 |
| `btn/Btn_UpGrade_Puple.png` | 64x64 | Btn_UpGrade_Puple | 1 |
| `btn/Btn_Up_02.png` | 41x31 | Btn_Up_02 | 1 |
| `btn/Btn_Weapon.png` | 70x76 | Btn_Weapon | 1 |
| `btn/Btn_WoodTable.png` | 41x78 | Btn_WoodTable | 1 |
| `btn/Btn_Yellow.png` | 72x72 | Btn_Yellow | 2 |
| `btn/Btn_Yellow_-_Copy.png` | 66x73 | Btn_Yellow - Copy | 1 |
| `btn/Btn_Yellow_02.png` | 40x64 | Btn_Yellow_02 | 1 |
| `btn/Btn_Yellow_H102.png` | 56x102 | Btn_Yellow_H102 | 1 |
| `btn/Btn_Yellow_H128.png` | 114x128 | Btn_Yellow_H128 | 1 |
| `btn/Btn_Yellow_H60.png` | 46x60 | Btn_Yellow_H60 | 3 |
| `btn/Btn_Yellow_H70.png` | 64x70 | Btn_Yellow_H70 | 2 |
| `btn/Btn_Yellow_R12.png` | 64x64 | Btn_Yellow_R12 | 1 |

## frame (106)

Card/slot border frames, many by color (Green/Red/Purple) and purpose (Frame_Traits_Purple, Frame_Chest_Open). Frame_R20 style names = generic rounded-rect frame at a given corner radius — good generic reusable frame candidates.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `frame/Frame_1of3_Blue_V01.png` | 70x72 | Frame_1of3_Blue_V01 | 2 |
| `frame/Frame_1of3_Green_V01.png` | 70x72 | Frame_1of3_Green_V01 | 2 |
| `frame/Frame_1of3_Purple_V01.png` | 70x72 | Frame_1of3_Purple_V01 | 2 |
| `frame/Frame_Blank.png` | 58x58 | Frame_Blank | 1 |
| `frame/Frame_Blue.png` | 58x58 | Frame_Blue | 1 |
| `frame/Frame_Bottom_GoodsBase.png` | 63x56 | Frame_Bottom_GoodsBase | 1 |
| `frame/Frame_Brown_Preset.png` | 64x64 | Frame_Brown_Preset | 1 |
| `frame/Frame_Brown_R14.png` | 70x70 | Frame_Brown_R14 | 1 |
| `frame/Frame_Cargo.png` | 64x64 | Frame_Cargo | 1 |
| `frame/Frame_Character_Select_01-1.png` | 64x64 | Frame_Character_Select_01-1 | 1 |
| `frame/Frame_Character_Select_01-2.png` | 128x128 | Frame_Character_Select_01-2 | 1 |
| `frame/Frame_Character_Select_02-1.png` | 64x64 | Frame_Character_Select_02-1 | 1 |
| `frame/Frame_Character_Select_02-2.png` | 128x128 | Frame_Character_Select_02-2 | 1 |
| `frame/Frame_Character_Select_Shine.png` | 190x174 | Frame_Character_Select_Shine | 1 |
| `frame/Frame_Chest_Empty.png` | 64x128 | Frame_Chest_Empty | 1 |
| `frame/Frame_Chest_Lock.png` | 64x128 | Frame_Chest_Lock | 1 |
| `frame/Frame_Chest_Open.png` | 64x128 | Frame_Chest_Open | 1 |
| `frame/Frame_Chest_Time.png` | 64x128 | Frame_Chest_Time | 1 |
| `frame/Frame_Chest_Unlock.png` | 64x128 | Frame_Chest_Unlock | 1 |
| `frame/Frame_Collection_Bottom.png` | 32x64 | Frame_Collection_Bottom | 1 |
| `frame/Frame_DropUp.png` | 167x39 | Frame_DropUp | 1 |
| `frame/Frame_Gradation.png` | 110x130 | Frame_Gradation | 1 |
| `frame/Frame_Gray.png` | 58x58 | Frame_Gray | 1 |
| `frame/Frame_Green.png` | 58x58 | Frame_Green | 2 |
| `frame/Frame_Grey.png` | 58x58 | Frame_Grey | 2 |
| `frame/Frame_Invasion_Lose_Blue.png` | 292x140 | Frame_Invasion_Lose_Blue | 1 |
| `frame/Frame_Invasion_Lose_Red.png` | 292x140 | Frame_Invasion_Lose_Red | 1 |
| `frame/Frame_Invasion_Mask.png` | 332x156 | Frame_Invasion_Mask | 1 |
| `frame/Frame_Invasion_Mission.png` | 80x154 | Frame_Invasion_Mission | 1 |
| `frame/Frame_Invasion_Pass_Free.png` | 208x88 | Frame_Invasion_Pass_Free | 1 |
| `frame/Frame_Invasion_Pass_Top.png` | 103x98 | Frame_Invasion_Pass_Top | 1 |
| `frame/Frame_Invasion_Pass_Vip.png` | 208x88 | Frame_Invasion_Pass_Vip | 1 |
| `frame/Frame_Invasion_Win_Blue.png` | 354x186 | Frame_Invasion_Win_Blue | 1 |
| `frame/Frame_Invasion_Win_Red.png` | 354x186 | Frame_Invasion_Win_Red | 1 |
| `frame/Frame_Item.png` | 58x62 | Frame_Item | 1 |
| `frame/Frame_LevelPass_Free.png` | 208x82 | Frame_LevelPass_Free | 1 |
| `frame/Frame_LevelPass_Top.png` | 96x88 | Frame_LevelPass_Top | 1 |
| `frame/Frame_LevelPass_Top_02.png` | 86x32 | Frame_LevelPass_Top_02 | 1 |
| `frame/Frame_LevelPass_Vip.png` | 208x82 | Frame_LevelPass_Vip | 1 |
| `frame/Frame_LevelPass_Vip_02.png` | 208x82 | Frame_LevelPass_Vip_02 | 1 |
| `frame/Frame_LevelPass_Vip_03.png` | 208x82 | Frame_LevelPass_Vip_03 | 1 |
| `frame/Frame_Lock.png` | 58x168 | Frame_Lock | 1 |
| `frame/Frame_Lock_Message.png` | 256x16 | Frame_Lock Message | 1 |
| `frame/Frame_Lock_2.png` | 58x94 | Frame_Lock_2 | 1 |
| `frame/Frame_LuckySpin_Glow_Get.png` | 150x150 | Frame_LuckySpin_Glow_Get | 1 |
| `frame/Frame_Mission_Attend_Basic.png` | 64x64 | Frame_Mission_Attend_Basic | 1 |
| `frame/Frame_Mission_Attend_Clear.png` | 64x64 | Frame_Mission_Attend_Clear | 1 |
| `frame/Frame_Mission_Attend_FinalTop.png` | 128x60 | Frame_Mission_Attend_FinalTop | 1 |
| `frame/Frame_Mission_Attend_Final_01.png` | 64x64 | Frame_Mission_Attend_Final_01 | 1 |
| `frame/Frame_Mission_Attend_Final_02.png` | 64x64 | Frame_Mission_Attend_Final_02 | 1 |
| `frame/Frame_Mission_Daily_Base.png` | 64x64 | Frame_Mission_Daily_Base | 2 |
| `frame/Frame_Name.png` | 44x28 | Frame_Name | 1 |
| `frame/Frame_NoAds.png` | 67x128 | Frame_NoAds | 1 |
| `frame/Frame_Open_2.png` | 58x94 | Frame_Open_2 | 1 |
| `frame/Frame_PiggyBank_Blue_Base.png` | 48x128 | Frame_PiggyBank_Blue_Base | 1 |
| `frame/Frame_Purple.png` | 58x58 | Frame_Purple | 1 |
| `frame/Frame_Purple_Outline.png` | 40x46 | Frame_Purple_Outline | 1 |
| `frame/Frame_Quest.png` | 64x64 | Frame_Quest | 1 |
| `frame/Frame_R20.png` | 64x64 | Frame_R20 | 2 |
| `frame/Frame_Rank_Reward_Base.png` | 128x95 | Frame_Rank_Reward_Base | 1 |
| `frame/Frame_Rank_Reward_Base_User.png` | 128x95 | Frame_Rank_Reward_Base_User | 1 |
| `frame/Frame_Ranking_1st.png` | 64x54 | Frame_Ranking_1st | 1 |
| `frame/Frame_Ranking_2nd.png` | 64x54 | Frame_Ranking_2nd | 1 |
| `frame/Frame_Ranking_3rd.png` | 64x54 | Frame_Ranking_3rd | 1 |
| `frame/Frame_Ranking_Base_Other.png` | 64x64 | Frame_Ranking_Base_Other | 1 |
| `frame/Frame_Ranking_Base_Score.png` | 32x32 | Frame_Ranking_Base_Score | 1 |
| `frame/Frame_Ranking_Base_Score_User.png` | 64x64 | Frame_Ranking_Base_Score_User | 1 |
| `frame/Frame_Ranking_Base_User.png` | 64x64 | Frame_Ranking_Base_User | 1 |
| `frame/Frame_Ranking_Other.png` | 64x54 | Frame_Ranking_Other | 1 |
| `frame/Frame_Ranking_User.png` | 63x64 | Frame_Ranking_User | 1 |
| `frame/Frame_Red.png` | 58x58 | Frame_Red | 1 |
| `frame/Frame_SGrade_Brown.png` | 64x64 | Frame_SGrade_Brown | 1 |
| `frame/Frame_Shop_Bg_Blue.png` | 76x112 | Frame_Shop_Bg_Blue | 1 |
| `frame/Frame_Shop_Bg_Gray.png` | 76x112 | Frame_Shop_Bg_Gray | 1 |
| `frame/Frame_Shop_Bg_Orange.png` | 76x112 | Frame_Shop_Bg_Orange | 1 |
| `frame/Frame_Shop_Bg_Orange_1.png` | 76x112 | Frame_Shop_Bg_Orange_1 | 1 |
| `frame/Frame_Shop_Bg_Pink.png` | 76x112 | Frame_Shop_Bg_Pink | 1 |
| `frame/Frame_Shop_Bg_Yellow.png` | 76x112 | Frame_Shop_Bg_Yellow | 1 |
| `frame/Frame_Shop_Box_Bg_Blue.png` | 74x266 | Frame_Shop_Box_Bg_Blue | 1 |
| `frame/Frame_Shop_Box_Bg_Purple.png` | 74x266 | Frame_Shop_Box_Bg_Purple | 1 |
| `frame/Frame_Shop_LegendaryBox.png` | 72x296 | Frame_Shop_LegendaryBox | 1 |
| `frame/Frame_Shop_PickUpPack_R16.png` | 64x64 | Frame_Shop_PickUpPack_R16 | 1 |
| `frame/Frame_Shop_PickUpPack_Select_Box.png` | 64x64 | Frame_Shop_PickUpPack_Select_Box | 1 |
| `frame/Frame_Shop_PickupPack_Orange.png` | 308x88 | Frame_Shop_PickupPack_Orange | 1 |
| `frame/Frame_Shop_PickupPack_Red.png` | 308x88 | Frame_Shop_PickupPack_Red | 1 |
| `frame/Frame_Shop_PickupPack_Yellow.png` | 250x310 | Frame_Shop_PickupPack_Yellow | 1 |
| `frame/Frame_Shop_SoulChest_Box.png` | 59x256 | Frame_Shop_SoulChest_Box | 1 |
| `frame/Frame_Shop_SpecialPack_Blue.png` | 72x136 | Frame_Shop_SpecialPack_Blue | 1 |
| `frame/Frame_Shop_SpecialPack_Red.png` | 68x128 | Frame_Shop_SpecialPack_Red | 1 |
| `frame/Frame_Shop_Stage_Pack_Blue.png` | 64x128 | Frame_Shop_Stage Pack_Blue | 1 |
| `frame/Frame_Shop_Stage_Pack_Green.png` | 64x128 | Frame_Shop_Stage Pack_Green | 1 |
| `frame/Frame_Shop_Stage_Pack_Red.png` | 64x128 | Frame_Shop_Stage Pack_Red | 1 |
| `frame/Frame_Shop_Stage_Pack_Yellow.png` | 64x128 | Frame_Shop_Stage Pack_Yellow | 1 |
| `frame/Frame_Shop_StarterPack.png` | 68x128 | Frame_Shop_StarterPack | 1 |
| `frame/Frame_Shop_Time_Bg.png` | 64x44 | Frame_Shop_Time_Bg | 1 |
| `frame/Frame_Shop_WeeklyTraitsPack.png` | 64x136 | Frame_Shop_WeeklyTraitsPack | 1 |
| `frame/Frame_Square_Line_Brown.png` | 50x50 | Frame_Square_Line_Brown | 1 |
| `frame/Frame_Time.png` | 64x54 | Frame_Time | 4 |
| `frame/Frame_TowerPass_Free.png` | 206x82 | Frame_TowerPass_Free | 1 |
| `frame/Frame_TowerPass_Vip.png` | 206x82 | Frame_TowerPass_Vip | 1 |
| `frame/Frame_TraitPass_Vip_01.png` | 208x83 | Frame_TraitPass_Vip_01 | 1 |
| `frame/Frame_Traits_Blue.png` | 64x64 | Frame_Traits_Blue | 1 |
| `frame/Frame_Traits_List.png` | 52x76 | Frame_Traits_List | 1 |
| `frame/Frame_Traits_Purple.png` | 64x64 | Frame_Traits_Purple | 1 |
| `frame/Frame_UpGrade_Bg.png` | 32x32 | Frame_UpGrade_Bg | 1 |
| `frame/Frame_Yellow.png` | 58x58 | Frame_Yellow | 2 |

## gauge (44)

Progress-bar textures. Gauge_Weapon_Level_Yellow and Gauge_Special_UpGrade_Green map directly to systems this app already has (weapon level bar, Special Upgrade tree bar). Gauge_Base_01/Gauge_Bg_H28 look like generic reusable bar backgrounds; Gauge_Handle_W8 is a slider handle/thumb.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `gauge/Gauge_Arrow_Frame.png` | 64x46 | Gauge_Arrow_Frame | 1 |
| `gauge/Gauge_Auto_Bg.png` | 49x40 | Gauge_Auto_Bg | 1 |
| `gauge/Gauge_Auto_Pattern.png` | 60x30 | Gauge_Auto_Pattern | 1 |
| `gauge/Gauge_Base_01.png` | 27x33 | Gauge_Base_01 | 1 |
| `gauge/Gauge_Base_02.png` | 24x24 | Gauge_Base_02 | 1 |
| `gauge/Gauge_Bg_H28.png` | 32x28 | Gauge_Bg_H28 | 1 |
| `gauge/Gauge_Blessing_Bg.png` | 32x36 | Gauge_Blessing_Bg | 1 |
| `gauge/Gauge_Blessing_Green.png` | 26x30 | Gauge_Blessing_Green | 1 |
| `gauge/Gauge_Blessing_Yellow.png` | 26x30 | Gauge_Blessing_Yellow | 1 |
| `gauge/Gauge_ChallengeTowerPass.png` | 24x24 | Gauge_ChallengeTowerPass | 1 |
| `gauge/Gauge_Defeat.png` | 157x157 | Gauge_Defeat | 1 |
| `gauge/Gauge_Defeat_Handle.png` | 55x54 | Gauge_Defeat_Handle | 1 |
| `gauge/Gauge_Frame_01.png` | 32x32 | Gauge_Frame_01 | 1 |
| `gauge/Gauge_Frame_02.png` | 24x24 | Gauge_Frame_02 | 1 |
| `gauge/Gauge_Frame_03.png` | 24x24 | Gauge_Frame_03 | 1 |
| `gauge/Gauge_Frame_Line.png` | 24x6 | Gauge_Frame_Line | 1 |
| `gauge/Gauge_Full_Green_H28.png` | 32x28 | Gauge_Full_Green_H28 | 1 |
| `gauge/Gauge_Green01.png` | 24x24 | Gauge_Green01 | 1 |
| `gauge/Gauge_Green02.png` | 24x24 | Gauge_Green02 | 1 |
| `gauge/Gauge_Handle_W8.png` | 8x32 | Gauge_Handle_W8 | 1 |
| `gauge/Gauge_Invasion_Pass.png` | 18x32 | Gauge_Invasion_Pass | 1 |
| `gauge/Gauge_Invasion_Pass_Bg.png` | 22x40 | Gauge_Invasion_Pass_Bg | 2 |
| `gauge/Gauge_Invasion_Pass_Green.png` | 18x32 | Gauge_Invasion_Pass_Green | 1 |
| `gauge/Gauge_Invasion_Pass_Mission.png` | 16x24 | Gauge_Invasion_Pass_Mission | 1 |
| `gauge/Gauge_Invasion_Pass_Mission_V01.png` | 27x33 | Gauge_Invasion_Pass_Mission_V01 | 1 |
| `gauge/Gauge_Invasion_Pass_Mission_V02.png` | 27x33 | Gauge_Invasion_Pass_Mission_V02 | 1 |
| `gauge/Gauge_Invasion_Pass_SkyBlue.png` | 26x26 | Gauge_Invasion_Pass_SkyBlue | 1 |
| `gauge/Gauge_LevelPass_Bg.png` | 32x32 | Gauge_LevelPass_Bg | 1 |
| `gauge/Gauge_Open_Yellow_R12.png` | 32x48 | Gauge_Open_Yellow_R12 | 7 |
| `gauge/Gauge_Orange01.png` | 24x24 | Gauge_Orange01 | 1 |
| `gauge/Gauge_Orange02.png` | 24x24 | Gauge_Orange02 | 1 |
| `gauge/Gauge_PiggyBank_Bg.png` | 56x52 | Gauge_PiggyBank_Bg | 1 |
| `gauge/Gauge_PiggyBank_Green.png` | 44x40 | Gauge_PiggyBank_Green | 1 |
| `gauge/Gauge_PiggyBank_Green_02.png` | 15x27 | Gauge_PiggyBank_Green_02 | 1 |
| `gauge/Gauge_Pink01.png` | 24x24 | Gauge_Pink01 | 1 |
| `gauge/Gauge_Pink02.png` | 24x24 | Gauge_Pink02 | 1 |
| `gauge/Gauge_Red.png` | 8x12 | Gauge_Red | 1 |
| `gauge/Gauge_Special_HighLight.png` | 48x42 | Gauge_Special_HighLight | 1 |
| `gauge/Gauge_Special_UpGrade_Bg.png` | 40x38 | Gauge_Special_UpGrade_Bg | 1 |
| `gauge/Gauge_Special_UpGrade_Green.png` | 28x30 | Gauge_Special_UpGrade_Green | 1 |
| `gauge/Gauge_Special_UpGrade_Yellow.png` | 28x30 | Gauge_Special_UpGrade_Yellow | 1 |
| `gauge/Gauge_Titles_Bg.png` | 52x55 | Gauge_Titles_Bg | 1 |
| `gauge/Gauge_Weapon_Level_Yellow.png` | 26x26 | Gauge_Weapon_Level_Yellow | 1 |
| `gauge/Gauge_Weapon_Num.png` | 50x25 | Gauge_Weapon_Num | 1 |

## popup (17)

Modal/popup background panels, by color (Blue/White/PurpleBlue). Popup_Reward_Info_01/02/03 are reward-display panel variants — good candidates for the item/weapon detail modal background.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `popup/Popup_Bg_Blue.png` | 64x64 | Popup_Bg_Blue | 3 |
| `popup/Popup_Bg_Bottom_Blue.png` | 257x118 | Popup_Bg_Bottom_Blue | 1 |
| `popup/Popup_Bg_Bottom_Purple.png` | 257x118 | Popup_Bg_Bottom_Purple | 1 |
| `popup/Popup_Bg_Deco_Blue.png` | 258x131 | Popup_Bg_Deco_Blue | 1 |
| `popup/Popup_Bg_Deco_Vcut.png` | 258x131 | Popup_Bg_Deco_Vcut | 1 |
| `popup/Popup_Bg_PurpleBlue_R22.png` | 80x83 | Popup_Bg_PurpleBlue_R22 | 1 |
| `popup/Popup_Bg_ReturnTicket_Blue.png` | 72x257 | Popup_Bg_ReturnTicket_Blue | 1 |
| `popup/Popup_Bg_Shop_Attendance_Orange_R24_V01.png` | 64x128 | Popup_Bg_Shop_Attendance_Orange_R24_V01 | 1 |
| `popup/Popup_Bg_Shop_Attendance_Red_R24_V01.png` | 64x128 | Popup_Bg_Shop_Attendance_Red_R24_V01 | 1 |
| `popup/Popup_Bg_Victory_Gradation_Brown.png` | 64x256 | Popup_Bg_Victory_Gradation_Brown | 1 |
| `popup/Popup_Bg_White.png` | 76x76 | Popup_Bg_White | 2 |
| `popup/Popup_Bottom_ReturnTicket_Blue.png` | 62x92 | Popup_Bottom_ReturnTicket_Blue | 1 |
| `popup/Popup_RewardBox_Message_01.png` | 166x104 | Popup_RewardBox_Message_01 | 1 |
| `popup/Popup_RewardBox_Message_02.png` | 64x40 | Popup_RewardBox_Message_02 | 1 |
| `popup/Popup_Reward_Info_01.png` | 106x104 | Popup_Reward_Info_01 | 1 |
| `popup/Popup_Reward_Info_02.png` | 44x34 | Popup_Reward_Info_02 | 1 |
| `popup/Popup_Reward_Info_03.png` | 44x36 | Popup_Reward_Info_03 | 2 |

## misc_tab (8)

Button_Tab_On_01..04 / Button_Tab_Off_01..04 — REAL bottom-nav tab bar buttons, on/off state pairs. Sizes vary per index (56x91, 64x64, 64x75, 64x110) meaning these are likely 4 DIFFERENT specific tab icons (not one generic reusable tab shape) — treat each numbered pair as its own tab, not a template.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_tab/Button_Tab_Off_01.png` | 56x91 | Button_Tab_Off_01 | 1 |
| `misc_tab/Button_Tab_Off_02.png` | 64x64 | Button_Tab_Off_02 | 1 |
| `misc_tab/Button_Tab_Off_03.png` | 64x64 | Button_Tab_Off_03 | 1 |
| `misc_tab/Button_Tab_Off_04.png` | 64x75 | Button_Tab_Off_04 | 1 |
| `misc_tab/Button_Tab_On_01.png` | 56x94 | Button_Tab_On_01 | 1 |
| `misc_tab/Button_Tab_On_02.png` | 64x63 | Button_Tab_On_02 | 1 |
| `misc_tab/Button_Tab_On_03.png` | 64x110 | Button_Tab_On_03 | 1 |
| `misc_tab/Button_Tab_On_04.png` | 64x110 | Button_Tab_On_04 | 1 |

## misc_star (28)

Icon_star / Icon_star_grey / Icon_star_rainbow (80x76, filled/empty/max-tier variants) are the real star-grade icons. Icn_Star_Hero_S14 (14x14) is a small inline variant for compact hero cards. The W_MorningStar_* / Stackable_Transcendence_MorningStar entries in this bucket are false-positive matches (weapon art that happens to contain 'star' in 'MorningStar') — ignore those, already covered by assets/img/weapons.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_star/ChapterStart.png` | 121x100 | ChapterStart | 1 |
| `misc_star/Icn_Special_UpGrade_Star.png` | 32x32 | Icn_Special_UpGrade_Star | 1 |
| `misc_star/Icn_Star_01.png` | 68x64 | Icn_Star_01 | 1 |
| `misc_star/Icn_Star_01-1.png` | 46x46 | Icn_Star_01-1 | 2 |
| `misc_star/Icn_Star_01-2.png` | 46x45 | Icn_Star_01-2 | 2 |
| `misc_star/Icn_Star_Hero_S14.png` | 14x14 | Icn_Star_Hero_S14 | 1 |
| `misc_star/Icn_Star_White_S40.png` | 36x35 | Icn_Star_White_S40 | 1 |
| `misc_star/Icon_star.png` | 80x76 | Icon_star | 1 |
| `misc_star/Icon_star_grey.png` | 80x76 | Icon_star_grey | 1 |
| `misc_star/Icon_star_rainbow.png` | 80x76 | Icon_star_rainbow | 1 |
| `misc_star/Img_StarterPack.png` | 341x309 | Img_StarterPack | 1 |
| `misc_star/MorningStar.png` | 123x121 | MorningStar | 1 |
| `misc_star/Pattern_Star_Particle.png` | 140x256 | Pattern_Star_Particle | 1 |
| `misc_star/Stackable_Transcendence_MorningStar.png` | 94x118 | Stackable_Transcendence_MorningStar | 1 |
| `misc_star/W_MorningStar.png` | 123x121 | W_MorningStar | 1 |
| `misc_star/W_MorningStar_3.png` | 117x125 | W_MorningStar_3 | 1 |
| `misc_star/W_MorningStar_4.png` | 115x116 | W_MorningStar_4 | 1 |
| `misc_star/W_MorningStar_5.png` | 125x128 | W_MorningStar_5 | 1 |
| `misc_star/W_MorningStar_6.png` | 120x128 | W_MorningStar_6 | 1 |
| `misc_star/W_MorningStar_7.png` | 120x126 | W_MorningStar_7 | 1 |
| `misc_star/W_MorningStar_8.png` | 128x128 | W_MorningStar_8 | 1 |
| `misc_star/W_MorningStar_9.png` | 123x124 | W_MorningStar_9 | 1 |
| `misc_star/W_MorningStar_S1_Step1.png` | 113x123 | W_MorningStar_S1_Step1 | 1 |
| `misc_star/W_MorningStar_S1_Step2.png` | 119x128 | W_MorningStar_S1_Step2 | 1 |
| `misc_star/W_MorningStar_S1_Step3.png` | 121x128 | W_MorningStar_S1_Step3 | 1 |
| `misc_star/W_MorningStar_S1_Step4.png` | 122x128 | W_MorningStar_S1_Step4 | 1 |
| `misc_star/fx_star_yellow.png` | 128x128 | fx_star_yellow | 1 |
| `misc_star/magic_runecircle_Start.png` | 236x236 | magic_runecircle_Start | 1 |

## misc_lock (26)

Real lock/unlock iconography at several sizes (Icn_Lock_01/02/03, Icon_Lock, Icon_Unlock) plus a countdown-clock icon family (Icon_Clock_*) for time-gated content.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_lock/Box_BossRaid_Popup_Unlock.png` | 116x104 | Box_BossRaid_Popup_Unlock | 1 |
| `misc_lock/Box_Traits_Lock.png` | 36x89 | Box_Traits_Lock | 1 |
| `misc_lock/Box_Traits_UnLock_V01.png` | 36x89 | Box_Traits_UnLock_V01 | 1 |
| `misc_lock/Box_Traits_UnLock_V02.png` | 36x89 | Box_Traits_UnLock_V02 | 1 |
| `misc_lock/Icn_BossRaid_Unlock_S128.png` | 100x114 | Icn_BossRaid_Unlock_S128 | 1 |
| `misc_lock/Icn_Clock_White.png` | 30x30 | Icn_Clock_White | 3 |
| `misc_lock/Icn_LevelPass_Lock.png` | 48x55 | Icn_LevelPass_Lock | 1 |
| `misc_lock/Icn_Lock.png` | 45x48 | Icn_Lock | 2 |
| `misc_lock/Icn_Lock_01.png` | 56x63 | Icn_Lock_01 | 1 |
| `misc_lock/Icn_Lock_02.png` | 52x54 | Icn_Lock_02 | 1 |
| `misc_lock/Icn_Lock_03.png` | 64x64 | Icn_Lock_03 | 1 |
| `misc_lock/Icn_Lock_Gray.png` | 60x64 | Icn_Lock_Gray | 1 |
| `misc_lock/Icn_Lock_Gray_S80.png` | 56x69 | Icn_Lock_Gray_S80 | 1 |
| `misc_lock/Icn_Lock_MultiOffer.png` | 64x64 | Icn_Lock_MultiOffer | 1 |
| `misc_lock/Icn_Lock_Yellow_S64.png` | 57x63 | Icn_Lock_Yellow_S64 | 2 |
| `misc_lock/Icon_Clock_Line.png` | 24x24 | Icon_Clock_Line | 3 |
| `misc_lock/Icon_Clock_Line_H32.png` | 24x24 | Icon_Clock_Line_H32 | 1 |
| `misc_lock/Icon_Clock_Orange_Line.png` | 64x64 | Icon_Clock_Orange_Line | 5 |
| `misc_lock/Icon_Clock_Red_Line_128.png` | 128x128 | Icon_Clock_Red_Line_128 | 1 |
| `misc_lock/Icon_LevelPass_Lock_Light.png` | 48x55 | Icon_LevelPass_Lock_Light | 1 |
| `misc_lock/Icon_Lock.png` | 66x75 | Icon_Lock | 3 |
| `misc_lock/Icon_Lock_01.png` | 52x60 | Icon_Lock_01 | 1 |
| `misc_lock/Icon_Unlock.png` | 67x79 | Icon_Unlock | 1 |
| `misc_lock/Img_BossRaid_BG_Lock_01.png` | 222x256 | Img_BossRaid_BG_Lock_01 | 1 |
| `misc_lock/Line_LevelPass_Lock.png` | 20x18 | Line_LevelPass_Lock | 1 |
| `misc_lock/UnlockWeaponSlot.png` | 121x121 | UnlockWeaponSlot | 1 |

## misc_check (9)

Real checkbox/checkmark icons (Icon_Check, Checkmark, Icn_Check_Circle_Green_S64) for selected-state UI.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_check/Box_Check_Base.png` | 40x40 | Box_Check_Base | 1 |
| `misc_check/Checkmark.png` | 27x23 | Checkmark | 1 |
| `misc_check/Icn_Check.png` | 32x29 | Icn_Check | 1 |
| `misc_check/Icn_Check_Circle_Green_S64.png` | 64x64 | Icn_Check_Circle_Green_S64 | 1 |
| `misc_check/Icon_Check.png` | 58x50 | Icon_Check | 4 |
| `misc_check/Icon_Check_-_Copy.png` | 70x70 | Icon_Check - Copy | 1 |
| `misc_check/Icon_Check_-_Copy_-_Copy.png` | 63x60 | Icon_Check - Copy - Copy | 1 |
| `misc_check/UICheckMark.png` | 11x11 | UICheckMark | 1 |
| `misc_check/icon_Chest_Check.png` | 25x25 | icon_Chest_Check | 1 |

## misc_toggle (2)

Only 2 hits, both Special-Upgrade-specific toggle box art — narrow, only useful if reskinning that exact feature.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_toggle/Box_UpGrade_Toggle_Bg_02.png` | 54x72 | Box_UpGrade_Toggle_Bg_02 | 1 |
| `misc_toggle/Box_UpGrade_Toggle_Gradation_02.png` | 90x76 | Box_UpGrade_Toggle_Gradation_02 | 1 |

## misc_nav (2)

Icon_NaviArrow / Icon_NaviHome — generic navigation arrow and home icons.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_nav/Icon_NaviArrow.png` | 32x23 | Icon_NaviArrow | 1 |
| `misc_nav/Icon_NaviHome.png` | 38x38 | Icon_NaviHome | 1 |

## misc_select (2)

Box_SGrade_Select_Brown / Img_SGrade_Select — S-grade (9th tier) selection highlight art.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_select/Box_SGrade_Select_Brown.png` | 124x128 | Box_SGrade_Select_Brown | 1 |
| `misc_select/Img_SGrade_Select.png` | 222x256 | Img_SGrade_Select | 1 |

## misc_bottom (9)

Popup bottom-decoration strips (Box_Popup_Bottom*) — footer flourish for modal panels.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_bottom/Box_Bottom_WeeklyGemPack.png` | 64x64 | Box_Bottom_WeeklyGemPack | 1 |
| `misc_bottom/Box_Popup_Bottom.png` | 110x162 | Box_Popup_Bottom | 1 |
| `misc_bottom/Box_Popup_Bottom_02.png` | 119x128 | Box_Popup_Bottom_02 | 1 |
| `misc_bottom/Box_Popup_Bottom_CreatorCode_Purple.png` | 64x94 | Box_Popup_Bottom_CreatorCode_Purple | 1 |
| `misc_bottom/Box_Popup_Bottom_SGrade_Red.png` | 68x128 | Box_Popup_Bottom_SGrade_Red | 1 |
| `misc_bottom/Box_Shop_Attendance_Blue_Bottom_R24.png` | 64x129 | Box_Shop_Attendance_Blue_Bottom_R24 | 1 |
| `misc_bottom/Box_Shop_Attendance_Purple_Bottom_R22.png` | 64x129 | Box_Shop_Attendance_Purple_Bottom_R22 | 1 |
| `misc_bottom/Img_Shop_Attendance_Fire_Bottom.png` | 256x92 | Img_Shop_Attendance_Fire_Bottom | 1 |
| `misc_bottom/PopupBottom_HalfGradation_H64_PurpleBlue.png` | 64x64 | PopupBottom_HalfGradation_H64_PurpleBlue | 1 |

## misc_active (3)

Sparse, mostly one-off promo/offer 'active state' art — low general reuse value.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_active/Box_ReturnTicket_Active_Blue.png` | 206x74 | Box_ReturnTicket_Active_Blue | 1 |
| `misc_active/Fx_ReturnTicket_Active.png` | 90x90 | Fx_ReturnTicket_Active | 1 |
| `misc_active/Fx_Shop_AD_Ticket_Active.png` | 94x94 | Fx_Shop_AD_Ticket_Active | 1 |

## common (82)

Generic rounded-rect/circle mask & gradient shapes at various corner radii (R4 through R27) and sizes — reusable low-level building blocks, not tied to any specific screen.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `common/Common_Blur_Line_R16.png` | 62x62 | Common_Blur_Line_R16 | 1 |
| `common/Common_Blur_R30.png` | 128x128 | Common_Blur_R30 | 2 |
| `common/Common_Blur_R34.png` | 128x128 | Common_Blur_R34 | 1 |
| `common/Common_BothRound_24.png` | 42x24 | Common_BothRound_24 | 1 |
| `common/Common_BothRound_32.png` | 50x32 | Common_BothRound_32 | 1 |
| `common/Common_BothRound_H22.png` | 30x22 | Common_BothRound_H22 | 1 |
| `common/Common_BothRound_H58.png` | 68x58 | Common_BothRound_H58 | 1 |
| `common/Common_BothRound_S32.png` | 38x32 | Common_BothRound_S32 | 2 |
| `common/Common_BothRound_S64.png` | 70x64 | Common_BothRound_S64 | 2 |
| `common/Common_CircleHalo_01.png` | 128x128 | Common_CircleHalo_01 | 9 |
| `common/Common_CircleHalo_02.png` | 243x242 | Common_CircleHalo_02 | 3 |
| `common/Common_CircleHalo_03.png` | 256x256 | Common_CircleHalo_03 | 2 |
| `common/Common_CircleRing.png` | 146x145 | Common_CircleRing | 1 |
| `common/Common_Circle_Bg_64.png` | 64x64 | Common_Circle_Bg_64 | 2 |
| `common/Common_Circle_H150.png` | 150x150 | Common_Circle_H150 | 1 |
| `common/Common_Clipping_R14.png` | 32x32 | Common_Clipping_R14 | 1 |
| `common/Common_Clipping_R19.png` | 38x38 | Common_Clipping_R19 | 1 |
| `common/Common_Gra_Square_R11.png` | 118x118 | Common_Gra_Square_R11 | 1 |
| `common/Common_Gra_Square_R31.png` | 122x122 | Common_Gra_Square_R31 | 1 |
| `common/Common_Gradation_Circle_01.png` | 256x256 | Common_Gradation_Circle_01 | 1 |
| `common/Common_Gradation_Circle_02.png` | 256x256 | Common_Gradation_Circle_02 | 2 |
| `common/Common_Gradation_Circle_03.png` | 256x256 | Common_Gradation_Circle_03 | 1 |
| `common/Common_Gradation_H256_V01.png` | 36x256 | Common_Gradation_H256_V01 | 2 |
| `common/Common_Gradation_H256_V02.png` | 32x175 | Common_Gradation_H256_V02 | 1 |
| `common/Common_Gradation_Half_R18.png` | 40x100 | Common_Gradation_Half_R18 | 1 |
| `common/Common_Gradation_R20.png` | 70x70 | Common_Gradation_R20 | 1 |
| `common/Common_Gradation_Side_V01.png` | 32x16 | Common_Gradation_Side_V01 | 1 |
| `common/Common_Gradation_Side_V02.png` | 12x16 | Common_Gradation_Side_V02 | 2 |
| `common/Common_Gradation_Side_V03.png` | 82x10 | Common_Gradation_Side_V03 | 1 |
| `common/Common_Half_R12.png` | 40x40 | Common_Half_R12 | 1 |
| `common/Common_Half_R18.png` | 38x30 | Common_Half_R18 | 1 |
| `common/Common_Half_R20.png` | 64x32 | Common_Half_R20 | 2 |
| `common/Common_Half_R20_H36.png` | 46x30 | Common_Half_R20_H36 | 1 |
| `common/Common_Half_R30.png` | 62x40 | Common_Half_R30 | 1 |
| `common/Common_Half_Square_R12.png` | 32x32 | Common_Half_Square_R12 | 1 |
| `common/Common_Half_Square_R15.png` | 42x32 | Common_Half_Square_R15 | 1 |
| `common/Common_Half_Square_R24.png` | 64x64 | Common_Half_Square_R24 | 1 |
| `common/Common_Hexagon_V01.png` | 30x30 | Common_Hexagon_V01 | 1 |
| `common/Common_R10.png` | 32x32 | Common_R10 | 3 |
| `common/Common_R14.png` | 64x64 | Common_R14 | 4 |
| `common/Common_R15.png` | 32x32 | Common_R15 | 1 |
| `common/Common_R20.png` | 70x70 | Common_R20 | 1 |
| `common/Common_Round_H48.png` | 64x48 | Common_Round_H48 | 1 |
| `common/Common_Round_Half_H16.png` | 64x64 | Common_Round_Half_H16 | 1 |
| `common/Common_Round_Half_H64.png` | 64x64 | Common_Round_Half_H64 | 1 |
| `common/Common_SquareR8.png` | 32x32 | Common_SquareR8 | 1 |
| `common/Common_Square_InShadow_R10.png` | 32x32 | Common_Square_InShadow_R10 | 1 |
| `common/Common_Square_InShadow_R20.png` | 76x76 | Common_Square_InShadow_R20 | 2 |
| `common/Common_Square_InShadow_R34.png` | 84x84 | Common_Square_InShadow_R34 | 1 |
| `common/Common_Square_Line_R12.png` | 64x64 | Common_Square_Line_R12 | 1 |
| `common/Common_Square_R10.png` | 32x32 | Common_Square_R10 | 1 |
| `common/Common_Square_R10_Half.png` | 32x32 | Common_Square_R10_Half | 4 |
| `common/Common_Square_R10_Half_rotated.png` | 32x32 | Common_Square_R10_Half_rotated | 1 |
| `common/Common_Square_R11.png` | 64x64 | Common_Square_R11 | 2 |
| `common/Common_Square_R12.png` | 64x64 | Common_Square_R12 | 4 |
| `common/Common_Square_R12_Half.png` | 40x40 | Common_Square_R12_Half | 1 |
| `common/Common_Square_R14.png` | 32x32 | Common_Square_R14 | 8 |
| `common/Common_Square_R15.png` | 64x64 | Common_Square_R15 | 1 |
| `common/Common_Square_R16.png` | 64x64 | Common_Square_R16 | 4 |
| `common/Common_Square_R18.png` | 64x64 | Common_Square_R18 | 2 |
| `common/Common_Square_R2.png` | 24x24 | Common_Square_R2 | 1 |
| `common/Common_Square_R20.png` | 64x64 | Common_Square_R20 | 2 |
| `common/Common_Square_R22.png` | 52x44 | Common_Square_R22 | 3 |
| `common/Common_Square_R24.png` | 64x64 | Common_Square_R24 | 3 |
| `common/Common_Square_R25.png` | 64x64 | Common_Square_R25 | 1 |
| `common/Common_Square_R26.png` | 64x52 | Common_Square_R26 | 1 |
| `common/Common_Square_R26_1.png` | 64x52 | Common_Square_R26_1 | 1 |
| `common/Common_Square_R27.png` | 64x64 | Common_Square_R27 | 1 |
| `common/Common_Square_R31.png` | 128x128 | Common_Square_R31 | 1 |
| `common/Common_Square_R36.png` | 100x100 | Common_Square_R36 | 1 |
| `common/Common_Square_R4.png` | 24x24 | Common_Square_R4 | 2 |
| `common/Common_Square_R41.png` | 100x100 | Common_Square_R41 | 1 |
| `common/Common_Square_R48.png` | 128x95 | Common_Square_R48 | 1 |
| `common/Common_Square_R5.png` | 32x32 | Common_Square_R5 | 2 |
| `common/Common_Square_R8.png` | 32x32 | Common_Square_R8 | 1 |
| `common/Common_Square_Thick_R10.png` | 32x14 | Common_Square_Thick_R10 | 1 |
| `common/Common_Square_Thick_R17_1.png` | 64x21 | Common_Square_Thick_R17 1 | 1 |
| `common/Common_Star_128.png` | 118x113 | Common_Star_128 | 1 |
| `common/Common_Star_Bg_64.png` | 60x58 | Common_Star_Bg_64 | 2 |
| `common/Common_Triangle.png` | 44x24 | Common_Triangle | 1 |
| `common/Common_Triangle_64.png` | 64x58 | Common_Triangle_64 | 1 |
| `common/Common_circle_64.png` | 64x64 | Common_circle_64 | 3 |

## label (93)

Small text-plate/badge backgrounds (Label_White_R10_H70, Label_Bg_*) plus some very specific one-off promo labels (Label_NewB_7Day_Festa, Label_Royal_Membership) that are probably not reusable outside their original context.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `label/Label_1of3_Yellow.png` | 131x120 | Label_1of3_Yellow | 1 |
| `label/Label_BG_r20.png` | 64x64 | Label_BG_r20 | 1 |
| `label/Label_Battle_Enemy.png` | 55x64 | Label_Battle_Enemy | 1 |
| `label/Label_Battle_Rival_Easy.png` | 64x64 | Label_Battle_Rival_Easy | 3 |
| `label/Label_Battle_Rival_Normal.png` | 64x64 | Label_Battle_Rival_Normal | 3 |
| `label/Label_Battle_Rival_Tough.png` | 64x64 | Label_Battle_Rival_Tough | 3 |
| `label/Label_Battle_User.png` | 55x64 | Label_Battle_User | 1 |
| `label/Label_Bg_01.png` | 24x24 | Label_Bg_01 | 1 |
| `label/Label_Bg_02.png` | 60x60 | Label_Bg_02 | 1 |
| `label/Label_Bg_02_FrameLight.png` | 64x64 | Label_Bg_02_FrameLight | 1 |
| `label/Label_Bg_02_Out.png` | 60x60 | Label_Bg_02_Out | 1 |
| `label/Label_Bg_04.png` | 40x40 | Label_Bg_04 | 1 |
| `label/Label_Bg_04_Out.png` | 40x40 | Label_Bg_04_Out | 1 |
| `label/Label_Bg_04_Shadow.png` | 40x23 | Label_Bg_04_Shadow | 1 |
| `label/Label_Bg_05.png` | 80x55 | Label_Bg_05 | 2 |
| `label/Label_Bg_05_Shadow.png` | 64x26 | Label_Bg_05_Shadow | 2 |
| `label/Label_Bg_06.png` | 57x40 | Label_Bg_06 | 1 |
| `label/Label_Bg_3.png` | 60x60 | Label_Bg_3 | 1 |
| `label/Label_Bg_Arrow.png` | 48x44 | Label_Bg_Arrow | 1 |
| `label/Label_Bg_Half.png` | 50x50 | Label_Bg_Half | 1 |
| `label/Label_Bg_Half02.png` | 50x40 | Label_Bg_Half02 | 1 |
| `label/Label_Bg_R16_Out.png` | 44x44 | Label_Bg_R16_Out | 1 |
| `label/Label_Bg_Title.png` | 64x70 | Label_Bg_Title | 1 |
| `label/Label_Bg_Title_2.png` | 70x76 | Label_Bg_Title_2 | 1 |
| `label/Label_Bg_gradation_03.png` | 30x20 | Label_Bg_gradation_03 | 1 |
| `label/Label_Bg_r12.png` | 40x40 | Label_Bg_r12 | 1 |
| `label/Label_Bg_r26.png` | 64x64 | Label_Bg_r26 | 1 |
| `label/Label_Btn_PickUp_Anicent.png` | 100x36 | Label_Btn_PickUp_Anicent | 1 |
| `label/Label_Calendar_Today.png` | 64x64 | Label_Calendar_Today | 1 |
| `label/Label_Clear.png` | 64x52 | Label_Clear | 1 |
| `label/Label_Colletion_Title_Bg.png` | 128x88 | Label_Colletion_Title_Bg | 1 |
| `label/Label_ConerTag_02.png` | 32x52 | Label_ConerTag_02 | 1 |
| `label/Label_ConerTag_H70.png` | 46x70 | Label_ConerTag_H70 | 1 |
| `label/Label_ConerTag_R12.png` | 64x54 | Label_ConerTag_R12 | 1 |
| `label/Label_DashBoard_Ribbon_Gray.png` | 120x64 | Label_DashBoard_Ribbon_Gray | 1 |
| `label/Label_Exotic_Gradation.png` | 560x40 | Label_Exotic_Gradation | 1 |
| `label/Label_Floor_Title.png` | 128x106 | Label_Floor_Title | 1 |
| `label/Label_Gra_Shine_01.png` | 71x52 | Label_Gra_Shine_01 | 2 |
| `label/Label_Gradation_Black_H32.png` | 32x32 | Label_Gradation_Black_H32 | 1 |
| `label/Label_Gradation_White.png` | 192x30 | Label_Gradation_White | 3 |
| `label/Label_Gradation_White2.png` | 506x80 | Label_Gradation_White2 | 1 |
| `label/Label_HeaderTag_Hexagon.png` | 62x36 | Label_HeaderTag_Hexagon | 1 |
| `label/Label_Hex_Stone_Blue_01.png` | 206x96 | Label_Hex_Stone_Blue_01 | 1 |
| `label/Label_Invasion_Pass_Top.png` | 60x52 | Label_Invasion_Pass_Top | 1 |
| `label/Label_MainWeapon.png` | 40x40 | Label_MainWeapon | 1 |
| `label/Label_Membership_Blue.png` | 64x68 | Label_Membership_Blue | 1 |
| `label/Label_NewB_7Day_Festa.png` | 32x29 | Label_NewB_7Day_Festa | 1 |
| `label/Label_PercentList.png` | 78x92 | Label_PercentList | 1 |
| `label/Label_PickUp_Tier_Ancient.png` | 283x146 | Label_PickUp_Tier_Ancient | 1 |
| `label/Label_Red_Banner_V01.png` | 300x32 | Label_Red_Banner_V01 | 1 |
| `label/Label_Red_H56.png` | 64x56 | Label_Red_H56 | 1 |
| `label/Label_Ribbon_Under_Orange_01.png` | 49x71 | Label_Ribbon_Under_Orange_01 | 1 |
| `label/Label_Ribbon_Under_Red_01.png` | 49x71 | Label_Ribbon_Under_Red_01 | 1 |
| `label/Label_Royal_Membership.png` | 188x44 | Label_Royal_Membership | 1 |
| `label/Label_Royal_Membership_Yellow.png` | 64x68 | Label_Royal_Membership_Yellow | 1 |
| `label/Label_Sale.png` | 128x100 | Label_Sale | 1 |
| `label/Label_Shine_01.png` | 64x44 | Label_Shine_01 | 1 |
| `label/Label_Shine_02.png` | 57x64 | Label_Shine_02 | 2 |
| `label/Label_Shop_Goods_Title_01.png` | 128x70 | Label_Shop_Goods_Title_01 | 1 |
| `label/Label_Shop_SpecialPack.png` | 128x38 | Label_Shop_SpecialPack | 1 |
| `label/Label_Tilt_H66.png` | 62x64 | Label_Tilt_H66 | 1 |
| `label/Label_Title_Ancient.png` | 87x58 | Label_Title_Ancient | 1 |
| `label/Label_Title_Arrow_Blue_Left.png` | 64x46 | Label_Title_Arrow_Blue_Left | 1 |
| `label/Label_Title_Arrow_Blue_Middle.png` | 63x46 | Label_Title_Arrow_Blue_Middle | 1 |
| `label/Label_Title_Arrow_Blue_Right.png` | 64x46 | Label_Title_Arrow_Blue_Right | 1 |
| `label/Label_Title_Arrow_Dim_V01-1.png` | 64x46 | Label_Title_Arrow_Dim_V01-1 | 1 |
| `label/Label_Title_Arrow_Dim_V01-2.png` | 64x46 | Label_Title_Arrow_Dim_V01-2 | 1 |
| `label/Label_Title_Arrow_Purple_Left.png` | 64x46 | Label_Title_Arrow_Purple_Left | 1 |
| `label/Label_Title_Arrow_Purple_Middle.png` | 63x46 | Label_Title_Arrow_Purple_Middle | 1 |
| `label/Label_Title_Arrow_Purple_Right.png` | 64x46 | Label_Title_Arrow_Purple_Right | 1 |
| `label/Label_Title_Arrow_Yellow_V01-1.png` | 64x46 | Label_Title_Arrow_Yellow_V01-1 | 1 |
| `label/Label_Title_Arrow_Yellow_V01-2.png` | 64x46 | Label_Title_Arrow_Yellow_V01-2 | 1 |
| `label/Label_Title_Arrow_Yellow_V01-3.png` | 64x46 | Label_Title_Arrow_Yellow_V01-3 | 1 |
| `label/Label_Title_Epic.png` | 64x43 | Label_Title_Epic | 1 |
| `label/Label_Title_IslandName.png` | 160x84 | Label_Title_IslandName | 1 |
| `label/Label_Title_Legendary.png` | 87x58 | Label_Title_Legendary | 1 |
| `label/Label_Title_Mission_Red.png` | 207x151 | Label_Title_Mission_Red | 1 |
| `label/Label_Title_Mythic.png` | 87x58 | Label_Title_Mythic | 1 |
| `label/Label_Title_Ranking_Blue_Deco.png` | 59x128 | Label_Title_Ranking_Blue_Deco | 1 |
| `label/Label_Title_Ranking_Blue_base.png` | 90x120 | Label_Title_Ranking_Blue_base | 1 |
| `label/Label_Title_Ribbon_Blue_V01.png` | 256x130 | Label_Title_Ribbon_Blue_V01 | 1 |
| `label/Label_Title_TraitsMembership_Purple.png` | 128x95 | Label_Title_TraitsMembership_Purple | 1 |
| `label/Label_Title_VCut_Challenge_Red.png` | 230x123 | Label_Title_VCut_Challenge_Red | 1 |
| `label/Label_Title_VCut_Rank_Blue.png` | 230x123 | Label_Title_VCut_Rank_Blue | 1 |
| `label/Label_Title_VCut_Rank_Red.png` | 230x123 | Label_Title_VCut_Rank_Red | 1 |
| `label/Label_TotalAbility_Brown.png` | 70x48 | Label_TotalAbility_Brown | 1 |
| `label/Label_TraitsMembership_Ribbon_Purple.png` | 64x54 | Label_TraitsMembership_Ribbon_Purple | 1 |
| `label/Label_Vip_Blue.png` | 188x44 | Label_Vip_Blue | 1 |
| `label/Label_Weapons_Ribbon_Orange.png` | 54x64 | Label_Weapons_Ribbon_Orange | 1 |
| `label/Label_Weapons_Ribbon_Yellow.png` | 119x63 | Label_Weapons_Ribbon_Yellow | 1 |
| `label/Label_White_R10_H70.png` | 46x70 | Label_White_R10_H70 | 1 |
| `label/Label_WoodTable.png` | 24x26 | Label_WoodTable | 1 |
| `label/Label_Yellow_VCut_V01.png` | 96x56 | Label_Yellow_VCut_V01 | 1 |

## gradation (62)

Gradient/shadow overlay sprites (soft fades, spotlights, vignettes) — useful for depth behind cards or under headers.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `gradation/Gradation_BG_Purple.png` | 72x547 | Gradation_BG_Purple | 1 |
| `gradation/Gradation_Bar.png` | 318x49 | Gradation_Bar | 4 |
| `gradation/Gradation_Bar_02.png` | 180x16 | Gradation_Bar_02 | 2 |
| `gradation/Gradation_Bg_Blue.png` | 128x128 | Gradation_Bg_Blue | 2 |
| `gradation/Gradation_Black_Label.png` | 256x80 | Gradation_Black_Label | 1 |
| `gradation/Gradation_BottomBg.png` | 16x256 | Gradation_BottomBg | 1 |
| `gradation/Gradation_Box_Eternal.png` | 64x14 | Gradation_Box_Eternal | 1 |
| `gradation/Gradation_Box_Exotic.png` | 64x14 | Gradation_Box_Exotic | 1 |
| `gradation/Gradation_Box_Mythic.png` | 64x14 | Gradation_Box_Mythic | 1 |
| `gradation/Gradation_CenterLine.png` | 256x16 | Gradation_CenterLine | 2 |
| `gradation/Gradation_Circle_256.png` | 256x256 | Gradation_Circle_256 | 9 |
| `gradation/Gradation_Circle_312.png` | 290x292 | Gradation_Circle_312 | 3 |
| `gradation/Gradation_Circle_White.png` | 256x256 | Gradation_Circle_White | 1 |
| `gradation/Gradation_Circle_White_3.png` | 128x128 | Gradation_Circle_White_3 | 1 |
| `gradation/Gradation_Deep_Blue.png` | 6x256 | Gradation_Deep_Blue | 1 |
| `gradation/Gradation_Dim_02.png` | 16x256 | Gradation_Dim_02 | 1 |
| `gradation/Gradation_Dimed_White.png` | 45x252 | Gradation_Dimed_White | 1 |
| `gradation/Gradation_Green_Ability.png` | 12x256 | Gradation_Green_Ability | 1 |
| `gradation/Gradation_H180.png` | 44x180 | Gradation_H180 | 1 |
| `gradation/Gradation_H230.png` | 23x230 | Gradation_H230 | 1 |
| `gradation/Gradation_H80.png` | 20x80 | Gradation_H80 | 7 |
| `gradation/Gradation_Half_Circle.png` | 93x38 | Gradation_Half_Circle | 1 |
| `gradation/Gradation_Half_Diagonal_R16_H128.png` | 128x126 | Gradation_Half_Diagonal_R16_H128 | 1 |
| `gradation/Gradation_Half_H240_R24.png` | 64x240 | Gradation_Half_H240_R24 | 1 |
| `gradation/Gradation_Half_R16_H64.png` | 251x64 | Gradation_Half_R16_H64 | 1 |
| `gradation/Gradation_Half_R24.png` | 64x52 | Gradation_Half_R24 | 2 |
| `gradation/Gradation_Half_S128_V01.png` | 16x128 | Gradation_Half_S128_V01 | 1 |
| `gradation/Gradation_Horizon_H40.png` | 377x40 | Gradation_Horizon_H40 | 1 |
| `gradation/Gradation_Inside.png` | 256x256 | Gradation_Inside | 1 |
| `gradation/Gradation_Label.png` | 256x2 | Gradation_Label | 2 |
| `gradation/Gradation_Label_Half.png` | 128x2 | Gradation_Label_Half | 1 |
| `gradation/Gradation_R12.png` | 36x28 | Gradation_R12 | 2 |
| `gradation/Gradation_R14.png` | 32x25 | Gradation_R14 | 1 |
| `gradation/Gradation_R16_H34.png` | 80x34 | Gradation_R16_H34 | 1 |
| `gradation/Gradation_R16_H84.png` | 64x84 | Gradation_R16_H84 | 1 |
| `gradation/Gradation_R18_H42.png` | 46x42 | Gradation_R18_H42 | 1 |
| `gradation/Gradation_R22_H170.png` | 62x170 | Gradation_R22_H170 | 1 |
| `gradation/Gradation_R22_H256.png` | 64x256 | Gradation_R22_H256 | 1 |
| `gradation/Gradation_R24.png` | 64x256 | Gradation_R24 | 1 |
| `gradation/Gradation_R6_H80.png` | 18x80 | Gradation_R6_H80 | 1 |
| `gradation/Gradation_RightSide_R16.png` | 128x48 | Gradation_RightSide_R16 | 1 |
| `gradation/Gradation_RightSide_R24.png` | 139x98 | Gradation_RightSide_R24 | 1 |
| `gradation/Gradation_RightSide_R24_2.png` | 139x98 | Gradation_RightSide_R24_2 | 1 |
| `gradation/Gradation_Shadow.png` | 395x142 | Gradation_Shadow | 1 |
| `gradation/Gradation_Shadow_02.png` | 318x153 | Gradation_Shadow_02 | 2 |
| `gradation/Gradation_SpotLight_01.png` | 231x263 | Gradation_SpotLight_01 | 4 |
| `gradation/Gradation_SpotLight_02.png` | 28x256 | Gradation_SpotLight_02 | 1 |
| `gradation/Gradation_SpotLight_03.png` | 148x291 | Gradation_SpotLight_03 | 1 |
| `gradation/Gradation_SpotLight_04.png` | 127x248 | Gradation_SpotLight_04 | 1 |
| `gradation/Gradation_Square.png` | 80x20 | Gradation_Square | 3 |
| `gradation/Gradation_Square_Blue_H128.png` | 24x128 | Gradation_Square_Blue_H128 | 1 |
| `gradation/Gradation_Square_Blue_H52_V01.png` | 124x100 | Gradation_Square_Blue_H52_V01 | 1 |
| `gradation/Gradation_Square_Orange_H74.png` | 10x64 | Gradation_Square_Orange_H74 | 1 |
| `gradation/Gradation_Square_Pink_Blue_H64.png` | 128x64 | Gradation_Square_Pink_Blue_H64 | 1 |
| `gradation/Gradation_Square_Red_H64.png` | 16x64 | Gradation_Square_Red_H64 | 1 |
| `gradation/Gradation_Square_Shine.png` | 128x83 | Gradation_Square_Shine | 1 |
| `gradation/Gradation_Square_Small.png` | 42x6 | Gradation_Square_Small | 1 |
| `gradation/Gradation_Square_White.png` | 40x46 | Gradation_Square_White | 9 |
| `gradation/Gradation_Square_White_LeftSide.png` | 46x40 | Gradation_Square_White_LeftSide | 1 |
| `gradation/Gradation_Square_White_Reverse.png` | 40x46 | Gradation_Square_White_Reverse | 1 |
| `gradation/Gradation_Square_White_RightSide.png` | 46x40 | Gradation_Square_White_RightSide | 1 |
| `gradation/Gradation_White.png` | 369x369 | Gradation_White | 2 |

## deco (56)

Decorative flourishes (twinkles, dots, stars, pattern lines) — sprinkle sparingly, not structural UI.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `deco/Deco_Bless_Leaf.png` | 68x100 | Deco_Bless_Leaf | 1 |
| `deco/Deco_Calendar_Spring.png` | 32x64 | Deco_Calendar_Spring | 1 |
| `deco/Deco_Collection_Box_Title.png` | 43x19 | Deco_Collection_Box_Title | 2 |
| `deco/Deco_Collection_Title_Triangle.png` | 46x20 | Deco_Collection_Title_Triangle | 1 |
| `deco/Deco_Colletion_Title_Leaf.png` | 68x100 | Deco_Colletion_Title_Leaf | 1 |
| `deco/Deco_Colletion_Title_Leaf_01.png` | 108x128 | Deco_Colletion_Title_Leaf_01 | 1 |
| `deco/Deco_Colletion_Title_Leaf_02.png` | 92x101 | Deco_Colletion_Title_Leaf_02 | 1 |
| `deco/Deco_Common_Triangle.png` | 32x14 | Deco_Common_Triangle | 1 |
| `deco/Deco_Common_Triangle_02.png` | 32x10 | Deco_Common_Triangle_02 | 1 |
| `deco/Deco_DownArrow_Half.png` | 85x52 | Deco_DownArrow_Half | 1 |
| `deco/Deco_Hero_Step_Line_Blue_01.png` | 32x8 | Deco_Hero_Step_Line_Blue_01 | 1 |
| `deco/Deco_Hero_Step_Line_Blue_02.png` | 110x110 | Deco_Hero_Step_Line_Blue_02 | 1 |
| `deco/Deco_Hero_Step_Line_Blue_03.png` | 64x86 | Deco_Hero_Step_Line_Blue_03 | 1 |
| `deco/Deco_Hero_Step_Line_Green_01.png` | 32x8 | Deco_Hero_Step_Line_Green_01 | 1 |
| `deco/Deco_Hero_Step_Line_Green_02.png` | 110x110 | Deco_Hero_Step_Line_Green_02 | 1 |
| `deco/Deco_Hero_Step_Line_Green_03.png` | 64x86 | Deco_Hero_Step_Line_Green_03 | 1 |
| `deco/Deco_Hero_Step_Line_Purple_01.png` | 32x8 | Deco_Hero_Step_Line_Purple_01 | 1 |
| `deco/Deco_Hero_Step_Line_Purple_02.png` | 110x110 | Deco_Hero_Step_Line_Purple_02 | 1 |
| `deco/Deco_Hero_Step_Line_Purple_03.png` | 64x86 | Deco_Hero_Step_Line_Purple_03 | 1 |
| `deco/Deco_LevelPass_Line.png` | 375x98 | Deco_LevelPass_Line | 2 |
| `deco/Deco_Line.png` | 208x14 | Deco_Line | 2 |
| `deco/Deco_Line_Tab_01.png` | 31x19 | Deco_Line_Tab_01 | 1 |
| `deco/Deco_Line_Tab_02.png` | 28x28 | Deco_Line_Tab_02 | 1 |
| `deco/Deco_LuckySpin_01.png` | 50x50 | Deco_LuckySpin_01 | 1 |
| `deco/Deco_LuckySpin_02.png` | 50x50 | Deco_LuckySpin_02 | 1 |
| `deco/Deco_Page_Dot.png` | 45x45 | Deco_Page_Dot | 1 |
| `deco/Deco_Page_Dot_Bg.png` | 24x24 | Deco_Page_Dot_Bg | 1 |
| `deco/Deco_PaperPiece_01.png` | 4x4 | Deco_PaperPiece_01 | 1 |
| `deco/Deco_Pattern_Diamond.png` | 32x44 | Deco_Pattern_Diamond | 1 |
| `deco/Deco_Rank_Leaf.png` | 88x128 | Deco_Rank_Leaf | 1 |
| `deco/Deco_Result_Leaf.png` | 128x253 | Deco_Result_Leaf | 1 |
| `deco/Deco_Reward_02.png` | 16x16 | Deco_Reward_02 | 1 |
| `deco/Deco_Shop_Title_Wood_01.png` | 100x90 | Deco_Shop_Title_Wood_01 | 1 |
| `deco/Deco_Square.png` | 12x12 | Deco_Square | 1 |
| `deco/Deco_SquareDot.png` | 23x24 | Deco_SquareDot | 3 |
| `deco/Deco_SquareDot_Brown.png` | 24x24 | Deco_SquareDot_Brown | 1 |
| `deco/Deco_SquareDot_Purple.png` | 24x24 | Deco_SquareDot_Purple | 1 |
| `deco/Deco_SquareDot_Yellow.png` | 23x24 | Deco_SquareDot_Yellow | 2 |
| `deco/Deco_Star_01.png` | 20x20 | Deco_Star_01 | 1 |
| `deco/Deco_Star_Blue.png` | 48x48 | Deco_Star_Blue | 1 |
| `deco/Deco_Star_Brown.png` | 48x48 | Deco_Star_Brown | 1 |
| `deco/Deco_Star_Pink.png` | 48x48 | Deco_Star_Pink | 1 |
| `deco/Deco_Star_Yellow.png` | 48x48 | Deco_Star_Yellow | 1 |
| `deco/Deco_Supply_Triangle.png` | 45x16 | Deco_Supply_Triangle | 1 |
| `deco/Deco_Sweapon_First_Pack_Title_Purple.png` | 58x108 | Deco_Sweapon_First_Pack_Title_Purple | 1 |
| `deco/Deco_Sweapon_UpGrade_Pack_Title_Orange.png` | 58x108 | Deco_Sweapon_UpGrade_Pack_Title_Orange | 1 |
| `deco/Deco_Title_LuckySpin_Jewel_02.png` | 30x38 | Deco_Title_LuckySpin_Jewel_02 | 1 |
| `deco/Deco_Titles_Round.png` | 42x98 | Deco_Titles_Round | 1 |
| `deco/Deco_Traits_Base_White.png` | 64x26 | Deco_Traits_Base_White | 1 |
| `deco/Deco_Triangle_01.png` | 30x58 | Deco_Triangle_01 | 1 |
| `deco/Deco_Twinkle.png` | 46x54 | Deco_Twinkle | 11 |
| `deco/Deco_Twinkle_01.png` | 28x28 | Deco_Twinkle_01 | 1 |
| `deco/Deco_Twinkle_02.png` | 32x32 | Deco_Twinkle_02 | 3 |
| `deco/Deco_Victory_Quick.png` | 32x26 | Deco_Victory_Quick | 1 |
| `deco/Deco_Vip_LvPass_1.png` | 258x131 | Deco_Vip_LvPass 1 | 1 |
| `deco/Deco_Wood.png` | 122x52 | Deco_Wood | 1 |

## misc_scroll (5)

Img_scroll_01/02/03 are parchment scroll-background textures (159x156 to 256x151) — nice flavor background for detail panels given the brown/parchment theme. ScrollArrow is a UI scroll-list arrow. Stackable_WeaponScroll_Normal is item art, already covered elsewhere — false-positive match here.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `misc_scroll/Img_scroll_01.png` | 159x156 | Img_scroll_01 | 1 |
| `misc_scroll/Img_scroll_02.png` | 235x157 | Img_scroll_02 | 1 |
| `misc_scroll/Img_scroll_03.png` | 256x151 | Img_scroll_03 | 1 |
| `misc_scroll/ScrollArrow.png` | 58x382 | ScrollArrow | 1 |
| `misc_scroll/Stackable_WeaponScroll_Normal.png` | 112x106 | Stackable_WeaponScroll_Normal | 1 |

## dark (2)

Dark_Sky (512x341) and Dark_Background (1024x683) are large scenic images, almost certainly in-battle/loading backdrops, NOT menu chrome. Probably not useful for this reskin — flagging so they aren't mistaken for a menu background.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `dark/Dark_Background.png` | 1024x683 | Dark_Background | 5 |
| `dark/Dark_Sky.png` | 512x341 | Dark_Sky | 5 |

## title (20)

Character/promo title-screen art (Title_Cactus, Title_Logo_Sword, Title_Boss_*) — marketing/splash art, not reusable menu chrome.

| File | Size | Raw sprite name | Reused N times |
|---|---|---|---|
| `title/Title_BG.png` | 1024x1024 | Title_BG | 7 |
| `title/Title_Basic.png` | 489x359 | Title_Basic | 7 |
| `title/Title_Basic_cape.png` | 212x61 | Title_Basic_cape | 7 |
| `title/Title_Blaster.png` | 508x450 | Title_Blaster | 7 |
| `title/Title_Boss_Body.png` | 472x429 | Title_Boss_Body | 7 |
| `title/Title_Boss_eye.png` | 239x197 | Title_Boss_eye | 7 |
| `title/Title_Boss_hand01.png` | 270x274 | Title_Boss_hand01 | 7 |
| `title/Title_Boss_hand02.png` | 409x443 | Title_Boss_hand02 | 7 |
| `title/Title_Boss_hand03.png` | 232x483 | Title_Boss_hand03 | 7 |
| `title/Title_Cactus.png` | 374x290 | Title_Cactus | 7 |
| `title/Title_Cactus_cape.png` | 202x112 | Title_Cactus_cape | 7 |
| `title/Title_Cat.png` | 479x441 | Title_Cat | 7 |
| `title/Title_Cat_we.png` | 248x256 | Title_Cat_we | 7 |
| `title/Title_DaggerEF.png` | 239x158 | Title_DaggerEF | 7 |
| `title/Title_Hana.png` | 483x506 | Title_Hana | 7 |
| `title/Title_Logo_Crossbow.png` | 426x470 | Title_Logo_Crossbow | 7 |
| `title/Title_Logo_Dagger.png` | 333x348 | Title_Logo_Dagger | 7 |
| `title/Title_Logo_Gun.png` | 447x464 | Title_Logo_Gun | 7 |
| `title/Title_Logo_Sword.png` | 352x442 | Title_Logo_Sword | 7 |
| `title/Title_Logo_txt.png` | 512x361 | Title_Logo_txt | 7 |

## bg (30)

| File | Size | Raw sprite name |
|---|---|---|
| `bg/Bg_Btn.png` | 72x72 | Bg_Btn |
| `bg/Bg_Btn_LevelPass_Top.png` | 40x40 | Bg_Btn_LevelPass_Top |
| `bg/Bg_Circle_Blue.png` | 128x128 | Bg_Circle_Blue |
| `bg/Bg_Circle_Blue_S.png` | 47x48 | Bg_Circle_Blue_S |
| `bg/Bg_Circle_Blue_S_Base.png` | 70x70 | Bg_Circle_Blue_S_Base |
| `bg/Bg_Circle_Brown.png` | 124x128 | Bg_Circle_Brown |
| `bg/Bg_Circle_Brown_S.png` | 47x48 | Bg_Circle_Brown_S |
| `bg/Bg_Circle_Red.png` | 128x128 | Bg_Circle_Red |
| `bg/Bg_Circle_Red_S.png` | 47x48 | Bg_Circle_Red_S |
| `bg/Bg_Circle_Yellow.png` | 128x128 | Bg_Circle_Yellow |
| `bg/Bg_Circle_Yellow_S.png` | 47x48 | Bg_Circle_Yellow_S |
| `bg/Bg_Invasion_Pass_Free.png` | 360x12 | Bg_Invasion_Pass_Free |
| `bg/Bg_Invasion_Pass_Vip.png` | 360x12 | Bg_Invasion_Pass_Vip |
| `bg/Bg_LevelEmblem_Silver.png` | 76x78 | Bg_LevelEmblem_Silver |
| `bg/Bg_LevelPass_Vip.png` | 256x12 | Bg_LevelPass_Vip |
| `bg/Bg_LevelPass_Vip_02.png` | 256x12 | Bg_LevelPass_Vip_02 |
| `bg/Bg_S_GradePass_Free.png` | 360x12 | Bg_S_GradePass_Free |
| `bg/Bg_S_GradePass_Vip.png` | 360x12 | Bg_S_GradePass_Vip |
| `bg/Bg_Shop_AD_Ticket_Active.png` | 128x78 | Bg_Shop_AD_Ticket_Active |
| `bg/Bg_Shop_PickUpPack_Ancient.png` | 306x116 | Bg_Shop_PickUpPack_Ancient |
| `bg/Bg_Shop_PickUpPack_Legendary.png` | 306x116 | Bg_Shop_PickUpPack_Legendary |
| `bg/Bg_SpeedEffect_Yellow.png` | 480x512 | Bg_SpeedEffect_Yellow |
| `bg/Bg_TowerEmblem_Silver.png` | 65x75 | Bg_TowerEmblem_Silver |
| `bg/Bg_TowerPass_Vip.png` | 256x12 | Bg_TowerPass_Vip |
| `bg/Bg_Vip_LvPass_01.png` | 54x54 | Bg_Vip_LvPass_01 |
| `bg/Bg_Vip_LvPass_02.png` | 257x118 | Bg_Vip_LvPass_02 |
| `bg/Bg_Vip_LvPass_03.png` | 54x54 | Bg_Vip_LvPass_03 |
| `bg/Bg_Vip_LvPass_04.png` | 257x118 | Bg_Vip_LvPass_04 |
| `bg/Bg_Vip_LvPass_05.png` | 54x54 | Bg_Vip_LvPass_05 |
| `bg/Bg_Vip_LvPass_06.png` | 257x118 | Bg_Vip_LvPass_06 |
