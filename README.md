# Squads Smart Account Program v0.1


What Changed Between Anchor/Solana Versions?
Anchor 0.29+ (which is required for Solana 2.x) made significant changes to IDL generation and type requirements.

In particular:
The IdlBuild trait is now required for all custom types used in accounts/instructions that derive AnchorSerialize/AnchorDeserialize.
The derive macros for AnchorSerialize/AnchorDeserialize now expect to be able to call IdlBuild methods on these types.
In earlier versions, Anchor would "just work" for many generic wrappers as long as they implemented serialization, but now it is stricter.
This is a breaking change introduced in Anchor 0.29.0 and later.

See:
Anchor 0.29.0 Release Notes
Migration Guide
Other Possible Reasons (besides missing IdlBuild):
Macro Expansion Changes:
The derive macros for AnchorSerialize/AnchorDeserialize now require IdlBuild for all types, not just those in accounts, but also those in instructions and events.

IDL Generation is Stricter:
Anchor now tries to generate a complete IDL for all types, including generics, and will fail if it cannot.
Changes in How Generics Are Handled:
Anchor may have previously ignored generics or treated them as opaque, but now it tries to fully expand them in the IDL.
Upstream Anchor/Solana Version Mismatch:
If you updated Solana but not Anchor, or vice versa, you may hit incompatibilities. Both must be updated together.
Feature Flags:
While some features are controlled by flags, this specific error is not related to a missing feature flag, but rather to trait requirements.
Why Did It Work Before?
Anchor 0.28.x and earlier did not require IdlBuild for all custom types.
Anchor 0.29.x and Solana 2.x require it for all types used in the program interface.
TL;DR
This is a breaking change in Anchor 0.29+ (required for Solana 2.x).
The only way to fix it is to implement IdlBuild for your custom types.
There is no feature flag or workaround to "turn off" this requirement.
If you want to keep using Solana 2.x and Anchor 0.29+, you must implement IdlBuild for all custom types used in your program's public interface.
Let me know if you want to see the official migration guide or if you want help with the implementation!

reat question! Here’s why those imports were chosen, and what’s going on:
Why were IdlType and IdlTypeDefinition imported?
The IdlBuild trait (used for custom types in Anchor IDL generation) requires you to implement methods that return or manipulate IdlType and IdlTypeDefinition.
These types are part of Anchor’s internal representation of types in the IDL (Interface Definition Language).
In Anchor 0.28.x and earlier, these types were public and available under anchor_lang::idl.
Why are you getting this error now?
In Anchor 0.29+, the public API for IDL generation changed. The types IdlType and IdlTypeDefinition are now only available when the idl-build feature is enabled, and sometimes they are not re-exported in the same way as before.
In some Anchor versions, these types are not available at all in the program crate, only in the CLI or in the anchor-syn crate (used for procedural macros).
The IdlBuild trait is still available, but its associated types may not be accessible in the same way.
What should you do?
1. Check your Anchor version
If you are using Anchor 0.29+, the correct way to implement IdlBuild for custom types is to only do so when the idl-build feature is enabled.
However, if IdlType and IdlTypeDefinition are not available, it means you are not supposed to implement this trait directly in your program crate.
2. What does the Anchor team recommend?
For most users, you should not need to implement IdlBuild yourself unless you are writing a custom macro or working on Anchor internals.
For generic wrappers like SmallVec, the recommended approach is to use a type that Anchor already understands (like Vec<T>) in your public interface, or to use a newtype wrapper with a manual implementation only if absolutely necessary.
3. What are your options?
Option 1: If you do not need to expose SmallVec in your public interface (accounts/instructions), use Vec<T> instead.
Option 2: If you must use SmallVec, and you are blocked by the lack of IdlType/IdlTypeDefinition, you may need to:
Use a custom feature flag to only compile the IdlBuild implementation when building the IDL, and
Use the same types as Anchor uses internally, but this is not recommended and may break in future versions.
Option 3: Check if there is a new way to register custom types for IDL in Anchor 0.29+ (the API may have changed).
Why did I choose those imports?
Because in previous Anchor versions, this was the documented and working way to implement IdlBuild for custom types. The error you are seeing is a result of changes in Anchor’s internal API and feature gating.
What should you do next?
Check your Anchor version and the documentation for custom type support in IDL.
If you are on Anchor 0.29+, you may not be able to implement IdlBuild for custom types in your program crate at all.
If you must use SmallVec, you may need to work around this by using Vec<T> in your public interface, or by checking for updates in the Anchor book or GitHub issues for guidance on custom generics in IDL.
Would you like me to check the latest Anchor documentation for the recommended way to support custom generic types in IDL for Anchor 0.29+?

Here’s what the Anchor experts and documentation say for Anchor 0.29+ (Solana 2.x):
There is currently no officially supported way to make Anchor’s IDL macros work with custom generic types like SmallVec<L, T> directly in your program crate.
The types and traits (IdlType, IdlTypeDefinition) needed for this are not available for implementation in the program crate—they are only available internally to Anchor’s codegen.
What are your options?
Use Vec<T> in your public interface (accounts/instructions):
This is the recommended and supported approach.
You can use SmallVec<L, T> internally, but all types exposed to Anchor’s IDL (i.e., in accounts and instruction arguments) should be Vec<T>.
This ensures compatibility with Anchor’s IDL and client codegen.
Manual IDL editing:
You could generate the IDL and then manually edit it, but this is not recommended and is error-prone.
Conditional compilation (advanced):
You could use feature flags to expose Vec<T> for IDL generation and SmallVec<L, T> for program execution, but this is complex and can lead to maintenance headaches.
Contribute to Anchor:
The only long-term solution is to propose and implement support for custom generics in Anchor itself.
Summary:
You cannot implement IdlBuild for your custom type in the program crate because the required types are not available.
The only robust solution is to use Vec<T> in your public interface and, if needed, convert to/from SmallVec<L, T> internally.
Would you like help refactoring your code to use Vec<T> in the public interface and keep SmallVec internal?

<img width="2500" alt="Frame 13" src="./assets/title_image.png">

![license][license-image]
![version][version-image]

[version-image]: https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat
[license-image]: https://img.shields.io/badge/license-AGPL_3.0-blue.svg?style=flat

We are developing the Smart Account Program to address programmability and cost limitations related to deploying smart contract wallets at scale on Solana.

In order to deliver on this promise it builds on the following innovations:

- **Rent free wallet creation**: deploy wallets for as little as 0,0000025 SOL without paying rent until the account needs to execute transactions. Allowing developers to generate addresses for users at scale without worrying about deployment costs.
- **Atomic policy enforcement and transaction execution**: this program empowers developers with optimized smart contract wallets fit for building fully onchain PSPs, stablecoin banks and programmable wallets alike.
- **Archivable accounts**: recoup rent costs from inactive accounts without compromising on security using state compression. Enabling developers to confidently cover fees for their user's accounts by removing the burden of costs associated with inactive users.
- **Policies**: set rules on which an account can execute transactions and extend your account's functionality by creating your own policy programs.

The Smart Account Program is in active development, with regular updates posted on [squads.so/blog](http://squads.so/blog) and [@SquadsProtocol](https://x.com/SquadsProtocol) on X.

## Content

This repository contains:

- The Squads Smart Account v0.1 program.
- The `@sqds/smart-account` Typescript SDK to interact with the smart account program.

## Program (Smart contract) Addresses

The Squads Smart Account Program v0.1 is deployed to:

- Solana Mainnet-beta: `SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`
- Solana Devnet: `SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`

Both deployments can be verified using the [Ellipsis Labs verifiable build](https://github.com/Ellipsis-Labs/solana-verifiable-build) tool.

## Responsibility

By interacting with this program, users acknowledge and accept full personal responsibility for any consequences, regardless of their nature. This includes both potential risks inherent to the smart contract, also referred to as program, as well as any losses resulting from user errors or misjudgment.

By using a smart account, it is important to acknowledge certain concepts. Here are some that could be misunderstood by users:

- Loss of Private Keys: If a participant loses their private key, the smart account may not be able to execute transactions if a threshold number of signatures is required.
- Single Point of Failure with Keys: If all keys are stored in the same location or device, a single breach can compromise the smart account.
- Forgetting the Threshold: Misremembering the number of signatures required can result in a deadlock, where funds cannot be accessed.
- No Succession Planning: If keyholders become unavailable (e.g., due to accident, death), without a plan for transition, funds may be locked forever.
- Transfer of funds to wrong address: Funds should always be sent to the smart account account, and not the smart account settingsaddress. Due to the design of the Squads Protocol program, funds deposited to the smart account may not be recoverable.
- If the settings_authority of a smart account is compromised, an attacker can change smart account settings, potentially reducing the required threshold for transaction execution or instantly being able to remove and add new members.
- If the underlying SVM compatible blockchain undergoes a fork and a user had sent funds to the orphaned chain, the state of the blockchain may not interpret the owner of funds to be original one.
- Users might inadvertently set long or permanent time-locks in their smart account, preventing access to their funds for that period of time.
- Smart account participants might not have enough of the native token of the underlying SVM blockchain to pay for transaction and state fees.

## Developers

You can interact with the Squads Smart Account Program via our SDKs.

List of SDKs:

- Typescript SDK: `@sqds/smart-account` (not yet published)

## Compiling and testing

You can compile the code with Anchor.

```
anchor build
```

If you do not have the Solana Anchor framework CLI installed, you can do so by following [this guide](https://www.anchor-lang.com/docs/installation).

To deploy the program on a local validator instance for testing or development purposes, you can create a local instance by running this command from the [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools).

```
solana-test-validator
```

To run the tests, first install the node modules for the repository.

```
yarn
```

or

```
npm install
```

And run these tests with this command:

```
yarn test
```

### Verifying the code

First, compile the programs code from the `Squads-Protocol/smart-account-program` Github repository to get its bytecode.

```
git clone https://github.com/Squads-Protocol/smart-account-program.git
```

```
anchor build
```

Now, install the [Ellipsis Labs verifiable build](https://crates.io/crates/solana-verify) crate.

```
cargo install solana-verify
```

Get the executable hash of the bytecode from the Squads program that was compiled.

```
solana-verify get-executable-hash target/deploy/squads_smart_account_program.so
```

Get the hash from the bytecode of the on-chain Squads program you want to verify.

```
solana-verify get-program-hash -u <cluster url> SMRTe6bnZAgJmXt9aJin7XgAzDn1XMHGNy95QATyzpk
```

If the hash outputs of those two commands match, the code in the repository matches the on-chain programs code.

## Security

The Squads Smart Account Program has been audited by Ottersec and Certora and additionally formally verified by Certora.

- Certora FV & Audit: [View Full Report](./audits/certora_smart_account_audit+FV.pdf)
- Ottersec Audit: (coming soon)

## License

The primary license for Squads Smart Account Program is the AGPL-3.0 license, see [LICENSE](./LICENSE). The following exceptions are licensed separately as follows:

- The file <https://github.com/Squads-Protocol/smart-account-program/blob/main/programs/squads_smart_account_program/src/utils/system.rs> is derived from code released under the [Apache 2.0 license](https://github.com/coral-xyz/anchor/blob/master/LICENSE) at <https://github.com/coral-xyz/anchor/blob/714d5248636493a3d1db1481f16052836ee59e94/lang/syn/src/codegen/accounts/constraints.rs#L1126-L1179>.
- The file <https://github.com/Squads-Protocol/smart-account-program/blob/main/programs/squads_smart_account_program/src/utils/small_vec.rs> is derived from code released under both the [Apache 2.0 license](https://github.com/near/borsh-rs/blob/master/LICENSE-APACHE) and the [MIT license](https://github.com/near/borsh-rs/blob/master/LICENSE-MIT) at <https://github.com/near/borsh-rs/blob/master/borsh/src/de/hint.rs> and <https://github.com/near/borsh-rs/blob/master/borsh/src/ser/mod.rs>.

To the extent that each such file incorporates code from another source, such code is licensed under its respective open source license as provided above, and the original open source code is copyrighted by its respective owner as provided above.
