export type CustomerType = 'tourist' | 'resident' | 'business';

export interface CustomerTypeConfig {
  label: string;
  badgeBg: string;
  badgeText: string;
  depositMessage: string | null;
}

export const CUSTOMER_TYPE_CONFIG: Record<CustomerType, CustomerTypeConfig> = {
  tourist: {
    label:          'Tourist',
    badgeBg:        '#F0F0EF',
    badgeText:      '#6B6B6B',
    depositMessage: null,
  },
  resident: {
    label:          'Resident',
    badgeBg:        '#E1F5EE',
    badgeText:      '#0F6E56',
    depositMessage: 'Reduced deposit',
  },
  business: {
    label:          'Business',
    badgeBg:        '#FBE8C4',
    badgeText:      '#854F0B',
    depositMessage: 'Deposit waived',
  },
};

export function getCustomerTypeConfig(type?: string | null): CustomerTypeConfig {
  return CUSTOMER_TYPE_CONFIG[type as CustomerType] ?? CUSTOMER_TYPE_CONFIG.tourist;
}
