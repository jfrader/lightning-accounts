import prisma from "../src/client"
import lightningService from "../src/services/lightning.service"

export default async () => {
  await prisma.$disconnect()
  await lightningService.close()
}
