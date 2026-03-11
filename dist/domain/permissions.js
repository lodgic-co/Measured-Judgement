const catalogue = new Map([
    ['organisation.view', { key: 'organisation.view', scope: 'organisation' }],
    ['organisation.users.manage', { key: 'organisation.users.manage', scope: 'organisation' }],
    ['organisation.properties.read', { key: 'organisation.properties.read', scope: 'organisation' }],
    ['property.configure', { key: 'property.configure', scope: 'property' }],
    ['reservations.view', { key: 'reservations.view', scope: 'property' }],
    ['reservations.create', { key: 'reservations.create', scope: 'property' }],
    ['reservations.modify', { key: 'reservations.modify', scope: 'property' }],
    ['reservations.cancel', { key: 'reservations.cancel', scope: 'property' }],
    ['rate_plans.view', { key: 'rate_plans.view', scope: 'organisation' }],
    ['rate_plans.values.modify', { key: 'rate_plans.values.modify', scope: 'property' }],
    ['rate_plans.structure.modify', { key: 'rate_plans.structure.modify', scope: 'property' }],
    ['financial.folios.view', { key: 'financial.folios.view', scope: 'property' }],
    ['financial.charges.post', { key: 'financial.charges.post', scope: 'property' }],
    ['financial.payments.post', { key: 'financial.payments.post', scope: 'property' }],
]);
export function lookupPermission(permissionKey) {
    return catalogue.get(permissionKey);
}
