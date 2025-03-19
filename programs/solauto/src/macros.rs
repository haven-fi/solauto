#[macro_export]
macro_rules! check {
    ($cond:expr, $err:expr) => {
        if !($cond) {
            let error_code: $crate::types::errors::SolautoError = $err;
            solana_program::msg!(
                "Error \"{}\" thrown at {}:{}",
                error_code,
                file!(),
                line!()
            );
            return Err(error_code.into());
        }
    };

    (
        $cond:expr,
        $err:expr,
        $($arg:tt)*
    ) => {
        if !($cond) {
            let error_code: $crate::types::errors::SolautoError = $err;
            solana_program::msg!(
                "Error \"{}\" thrown at {}:{}",
                error_code,
                file!(),
                line!()
            );
            solana_program::msg!($($arg)*);
            return Err(error_code.into());
        }
    };
}

#[macro_export]
macro_rules! create_enum {
    ($name:ident { $($variant:ident),* $(,)? }) => {
        #[repr(u8)]
        #[derive(BorshDeserialize, BorshSerialize, Clone, Debug, ShankType, Default, PartialEq, Copy)]
        pub enum $name {
            // Mark the first variant as the default.
            #[default]
            $(
                $variant,
            )*
        }

        unsafe impl Zeroable for $name {}
        unsafe impl Pod for $name {}
    };
}