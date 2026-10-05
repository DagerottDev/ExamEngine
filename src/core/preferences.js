export const DEFAULT_PREFERENCES = {theme:'system',accent:'blue',layout:'focused',timer:'right',palette:'left',interfaceFont:'system',questionFont:'system',textSize:18,width:70,lineHeight:1.6,motion:'auto',cards:['due','recent','weak','notebook']};
const choices = {theme:['system','light','dark'],accent:['blue','teal','violet'],layout:['focused','compact','spacious'],timer:['left','right','bottom'],palette:['left','right','collapsed'],interfaceFont:['system','source','lexend','atkinson'],questionFont:['system','source','lexend','atkinson','lora'],textSize:[16,18,20,22],width:[60,70,80],lineHeight:[1.4,1.6,1.8],motion:['auto','reduced','off']};
export function normalizePreferences(input = {}) {
  const result = {...DEFAULT_PREFERENCES};
  for (const [key, values] of Object.entries(choices)) if (values.includes(input?.[key])) result[key]=input[key];
  const cards=Array.isArray(input?.cards)?input.cards:[];
  result.cards=[...new Set([...cards,...DEFAULT_PREFERENCES.cards])].filter(id=>DEFAULT_PREFERENCES.cards.includes(id));
  return result;
}
