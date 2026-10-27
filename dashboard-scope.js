// Category pages share staff authentication and room permissions with the main dashboard.
export const categoryPages = {"nursing": "nursing-dashboard.html", "food": "F&B-dashboard.html", "housekeeping": "Housekeeping-dashboard.html", "engineering": "Engineering-dashboard.html", "ipBilling": "Billing-dashboard.html", "insurance": "Insurance-dashboard.html", "it": "IT-dashboard.html", "guestRelations": "Guest-relations-dashboard.html"};
export function dashboardCategory(value){
  if(!value)return null;
  if(!Object.hasOwn(categoryPages,value))throw new Error('Unknown dashboard category');
  return value;
}
export function scopeRequests(rows,category){
  const scope=dashboardCategory(category);
  return scope?rows.filter(row=>row.category===scope):rows;
}
