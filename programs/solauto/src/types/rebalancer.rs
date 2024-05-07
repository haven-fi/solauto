use super::solauto_manager::SolautoManager;


pub struct Rebalancer<'a, 'b> {
    pub solauto: SolautoManager<'a, 'b>
}

impl<'a, 'b> Rebalancer<'a, 'b> {
    pub fn new(solauto: SolautoManager<'a, 'b>) -> Self {
        Self {
            solauto
        }
    }
}