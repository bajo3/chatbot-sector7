import { prisma } from './prisma.js';
import bcrypt from 'bcryptjs';
import { env } from '../env.js';

async function main() {
  const adminPass = await bcrypt.hash(env.ADMIN_SEED_PASSWORD, 10);
  const sellerPass = await bcrypt.hash(env.SELLER_SEED_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: 'admin@sector7.local' },
    create: { email:'admin@sector7.local', name:'Admin', role:'ADMIN', passwordHash: adminPass, isOnline:true },
    update: { passwordHash: adminPass, isActive:true }
  });

  await prisma.user.upsert({
    where: { email: 'vendedor1@sector7.local' },
    create: { email:'vendedor1@sector7.local', name:'Vendedor 1', role:'SELLER', passwordHash: sellerPass, isOnline:true },
    update: { passwordHash: sellerPass, isActive:true }
  });

  await prisma.user.upsert({
    where: { email: 'vendedor2@sector7.local' },
    create: { email:'vendedor2@sector7.local', name:'Vendedor 2', role:'SELLER', passwordHash: sellerPass, isOnline:true },
    update: { passwordHash: sellerPass, isActive:true }
  });

  // catalog demo
  const demo = [
    { id:'ps5-standard', title:'PlayStation 5 Standard 1TB', category:'Consolas', priceArs: 980000, inStock:true, imageUrl:'', productUrl:'', tags:'ps5 playstation consola', popularity: 5 },
    { id:'ps5-digital', title:'PlayStation 5 Digital', category:'Consolas', priceArs: 890000, inStock:true, imageUrl:'', productUrl:'', tags:'ps5 playstation digital', popularity: 4 },
    { id:'silla-gamer-x', title:'Silla Gamer Sector7 X – Reclinable', category:'Sillas gamer', priceArs: 320000, inStock:true, imageUrl:'', productUrl:'', tags:'silla gamer reclinable', popularity: 5 },
    { id:'silla-gamer-eco', title:'Silla Gamer Eco – Tela', category:'Sillas gamer', priceArs: 210000, inStock:true, imageUrl:'', productUrl:'', tags:'silla gamer economica', popularity: 3 },
    { id:'auricular-7', title:'Auricular Gamer 7.1 USB', category:'Audio', priceArs: 65000, inStock:true, imageUrl:'', productUrl:'', tags:'auricular gamer 7.1', popularity: 2 }
  ];

  for (const p of demo) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: p as any,
      update: { ...p }
    });
  }

  console.log('Seed ok');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
