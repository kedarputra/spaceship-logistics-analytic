import { ROLE_NAMES } from "@/auth/roles";
import { accountsFromEnv } from "@/auth/users";
import { CardTitle } from "@/components/card-title";
import { PageHeader } from "@/components/page-header";
import { Table } from "@/components/text-table";
import { formatCount } from "@/domain/format";
import { getDataset } from "@/domain/orders";

/**
 * Users (ticket 31): the accounts in the users file and their roles, read-only, for admins. Accounts
 * are managed on the server with `npm run users`; no password or hash ever reaches the page.
 */
export function UsersPage() {
  const result = accountsFromEnv();
  const accounts = result.ok ? result.accounts : [];
  return (
    <>
      <PageHeader label="Admin" title="Users" asOf={getDataset().anchor} />
      <section aria-labelledby="accounts-title" className="card card-body">
        <CardTitle
          id="accounts-title"
          title="Accounts"
          info={["Who can sign in, and their roles. Accounts are added and removed on the server with npm run users."]}
          detail={`${formatCount(accounts.length)} ${accounts.length === 1 ? "account" : "accounts"}`}
        />
        <Table headers={["Username", "Role"]} rowHeaders rows={accounts.map(({ username, role }) => [username, ROLE_NAMES[role]])} />
      </section>
    </>
  );
}
