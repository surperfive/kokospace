/**
 * 骨骼 id 白名单。只有这些 id 的 <g> 才算骨骼节点，其余分组只是组织结构。
 * 与 src/lib/sipiqiRig.ts 里的姿态函数一一对应（poseBones 产出的 key 必须在这里）。
 */
export const RIG_BONES = [
  'Facing_Wrapper',
  'Character_Root',
  'Back_Hair_Rig',
  'Far_Leg_Rig',
  'Far_Arm_Rig',
  'Torso_Rig',
  'Skull_Rig',
  'Near_Leg_Rig',
  'Near_Arm_Rig',
  'Head_Rig',
  'Left_Side_Lock',
  'Right_Side_Lock',
  'Veil_Rig',
  'Left_Eye_Blink',
  'Right_Eye_Blink',
  'Left_Tear',
  'Right_Tear',
];
