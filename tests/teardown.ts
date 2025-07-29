import prisma from "../src/client"

export default async () => {
  await prisma.$disconnect()
}
