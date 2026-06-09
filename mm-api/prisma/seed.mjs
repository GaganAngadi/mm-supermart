import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function findByName(items, name) {
  const item = items.find((entry) => entry.name === name);
  if (!item) {
    throw new Error(`Missing seed item: ${name}`);
  }
  return item;
}

async function findOrCreateDesignation(name, departmentId) {
  const existing = await prisma.designation.findFirst({ where: { name, departmentId } });
  if (existing) {
    return existing;
  }

  return prisma.designation.create({ data: { name, departmentId } });
}

async function main() {
  const roleNames = ["Super Admin", "Store Owner", "Manager", "Cashier", "Inventory Staff", "HR Manager", "Branch Manager"];
  const roles = await Promise.all(
    roleNames.map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: {
          name,
          description: `${name} access`,
          permissions: { all: name === "Super Admin", modules: ["dashboard", "pos", "inventory", "employees", "reports"] }
        }
      })
    )
  );

  const branch =
    (await prisma.branch.findFirst({ where: { code: "MAIN", shopId: null } })) ??
    (await prisma.branch.create({
      data: {
        name: "M&M SuperMart Main Branch",
        code: "MAIN",
        address: "MG Road, Bengaluru",
        phone: "080-40000000",
        gstin: "29AABCMMSUP1Z5"
      }
    }));

  const departments = await Promise.all(
    ["Cashier", "Inventory", "Billing", "Warehouse", "Delivery", "Accounts", "HR", "Admin"].map((name) =>
      prisma.department.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  const shift =
    (await prisma.shift.findFirst({ where: { name: "General Shift" } })) ??
    (await prisma.shift.create({ data: { name: "General Shift", startTime: "09:00", endTime: "18:00" } }));

  const hrDepartment = findByName(departments, "HR");
  const cashierDepartment = findByName(departments, "Cashier");
  const hrDesignation = await findOrCreateDesignation("HR Manager", hrDepartment.id);
  const cashierDesignation = await findOrCreateDesignation("Senior Cashier", cashierDepartment.id);

  const superRole = findByName(roles, "Super Admin");
  const managerRole = findByName(roles, "Manager");
  const cashierRole = findByName(roles, "Cashier");

  await prisma.user.upsert({
    where: { email: "superadmin@mmsupermart.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "superadmin@mmsupermart.com",
      passwordHash: await bcrypt.hash("SuperAdmin@123", 10),
      roleId: superRole.id
    }
  });

  await prisma.user.upsert({
    where: { email: "manager@mmsupermart.com" },
    update: {},
    create: {
      name: "Store Manager",
      email: "manager@mmsupermart.com",
      passwordHash: await bcrypt.hash("Manager@123", 10),
      roleId: managerRole.id
    }
  });

  const cashierUser = await prisma.user.upsert({
    where: { email: "cashier@mmsupermart.com" },
    update: {},
    create: {
      name: "Cashier User",
      email: "cashier@mmsupermart.com",
      passwordHash: await bcrypt.hash("Cashier@123", 10),
      roleId: cashierRole.id
    }
  });

  await prisma.employee.upsert({
    where: { employeeCode: "EMP-2026-001" },
    update: {},
    create: {
      employeeCode: "EMP-2026-001",
      fullName: "Kavya Menon",
      mobile: "9876543210",
      email: "kavya@mmsupermart.com",
      dateOfJoining: new Date("2026-01-05"),
      salary: 0,
      branchId: branch.id,
      departmentId: hrDepartment.id,
      designationId: hrDesignation.id,
      shiftId: shift.id
    }
  });

  await prisma.employee.upsert({
    where: { employeeCode: "EMP-2026-002" },
    update: {},
    create: {
      employeeCode: "EMP-2026-002",
      fullName: "Rohit Kumar",
      mobile: "9123456780",
      email: "rohit@mmsupermart.com",
      dateOfJoining: new Date("2026-02-12"),
      salary: 0,
      userId: cashierUser.id,
      branchId: branch.id,
      departmentId: cashierDepartment.id,
      designationId: cashierDesignation.id,
      shiftId: shift.id
    }
  });

  await prisma.category.createMany({
    data: ["Dairy", "Grocery", "Snacks", "Personal Care", "Household"].map((name) => ({ name })),
    skipDuplicates: true
  });

  const branding = await prisma.setting.findFirst({ where: { key: "branding", shopId: null } });
  if (!branding) {
    await prisma.setting.create({
      data: {
        key: "branding",
        value: { brandName: "M&M SuperMart", primaryColor: "#047857", accentColor: "#f97316", logoUrl: "/mm-logo.jpg" }
      }
    });
  }

  await prisma.bankAccount.createMany({
    data: [
      { name: "HDFC Current Account", type: "BANK", currentBalance: 0, openingBalance: 0 },
      { name: "Main Cash Drawer", type: "CASH", currentBalance: 0, openingBalance: 0 },
      { name: "UPI Settlement", type: "BANK", currentBalance: 0, openingBalance: 0 }
    ],
    skipDuplicates: true
  });

  if ((await prisma.ledgerEntry.count()) === 0) {
    await prisma.ledgerEntry.createMany({
      data: [
        { accountName: "Customer Receivables", accountType: "RECEIVABLE", description: "Pending invoices", debit: 0, reference: "AR-OPENING" },
        { accountName: "Supplier Payables", accountType: "PAYABLE", description: "Supplier bills pending", credit: 0, reference: "AP-OPENING" },
        { accountName: "GST Output Tax", accountType: "TAX", description: "Estimated GSTR-3B payable", credit: 0, reference: "GST-OPENING" }
      ]
    });
  }

  if ((await prisma.expense.count()) === 0) {
    await prisma.expense.createMany({
      data: [
        { category: "Utilities", vendor: "Opening", amount: 0, gstRate: 18, paymentMode: "UPI" },
        { category: "Logistics", vendor: "Opening", amount: 0, gstRate: 18, paymentMode: "BANK" },
        { category: "Packaging", vendor: "Opening", amount: 0, gstRate: 12, paymentMode: "BANK" }
      ]
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
