export type UserWithWallet = Prisma.UserGetPayload<{
  include: { wallet: { select: { id: true; balanceInSats: true; disabled: true } } }
}>
